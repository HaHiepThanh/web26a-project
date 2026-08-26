import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { OrganizationStore } from '../ngrx/organization/organization.store';

/**
 * Route dạng /:orgSlug/... — đổi slug trên URL thành tổ chức đang chọn.
 *
 * Đây là điểm mấu chốt khiến link chia sẻ hoạt động đúng: người nhận có thể đang
 * mở một tổ chức khác, guard này chuyển họ sang đúng tổ chức của link TRƯỚC khi
 * trang được dựng, thay vì hiển thị dữ liệu của tổ chức sai.
 */
export const orgSlugGuard: CanActivateFn = async (route) => {
  const orgService = inject(OrganizationStore);
  const router = inject(Router);

  // Danh sách tổ chức lấy từ backend → phải chờ nạp xong mới tra được slug.
  await orgService.ensureLoaded();

  // Nạp danh sách tổ chức HỎNG (mất mạng, backend chưa chạy, token chưa sẵn
  // sàng) thì KHÔNG được kết luận "slug này không tồn tại" — lúc đó ta có mảng
  // rỗng vì lỗi, chứ không phải vì người dùng không có quyền. Cho vào app, trang
  // tự hiện banner lỗi. Trả 404 ở đây là nói dối người dùng.
  if (orgService.lastError()) return true;

  const slug = route.paramMap.get('orgSlug') ?? '';
  const org = orgService.orgBySlug(slug);

  // Không tìm thấy slug → 404. Hai trường hợp gộp làm một cách CỐ Ý: slug không
  // tồn tại, và slug có thật nhưng người này không thuộc tổ chức đó. Phân biệt
  // hai cái là vô tình xác nhận "tổ chức này có thật" cho người ngoài.
  if (!org) return router.createUrlTree(['/not-found']);

  if (orgService.activeOrgId() !== org.id) orgService.switchOrg(org.id);
  return true;
};

/**
 * Các link cũ dạng /workspace (header, footer, sau khi đăng nhập) chưa biết slug.
 * Guard này đưa về đúng /:slug/workspace của tổ chức đang chọn.
 */
export const orgRedirectGuard: CanActivateFn = async () => {
  const orgService = inject(OrganizationStore);
  const router = inject(Router);

  await orgService.ensureLoaded();

  // Nạp hỏng thì thử lại MỘT lần. Trường hợp hay gặp: lần nạp đầu chạy trước khi
  // Firebase kịp khôi phục phiên nên chưa có token.
  if (orgService.lastError()) await orgService.reload();

  const slug = orgService.activeOrgSlug() || orgService.organizations()[0]?.slug;
  if (slug) return router.createUrlTree(['/', slug, 'workspace']);

  // Vẫn hỏng → đưa vào app để thấy banner lỗi, ĐỪNG đá sang /onboarding: người
  // dùng sẽ tưởng mất sạch tổ chức và đi tạo thêm một cái thừa.
  if (orgService.lastError()) return true;

  // Thật sự chưa có tổ chức nào → onboarding.
  return router.createUrlTree(['/onboarding']);
};
