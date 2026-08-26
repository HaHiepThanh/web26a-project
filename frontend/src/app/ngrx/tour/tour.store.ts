import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import {
  OnboardingState,
  TOUR_STEP_IDS,
  TourStepId,
  emptyOnboardingState,
} from '../../models';
import { AuthService } from '../../services/auth.service';
import { EMPTY_COUNTS, TOUR_STEPS, TourCounts, TourStep, stepIndexOf } from './tour.steps';

/**
 * Bộ máy tour hướng dẫn người dùng mới — tầng 1.
 *
 * Vì sao là store cấp gốc chứ không phải state trong component:
 * tour đi xuyên route (`/:slug/workspace` → `/board/:id`) và qua nhiều modal.
 * State nằm trong component thì mỗi lần điều hướng là mất sạch, tour chết giữa
 * chừng. Store `providedIn: 'root'` sống suốt vòng đời app.
 *
 * Đặc tả: docs/HUONG-DAN-NGUOI-DUNG-MOI.md
 */

/** Người dùng chọn gì ở hộp mời. `basics` dừng sau khi có thẻ đầu tiên. */
export type TourMode = 'full' | 'basics';

export interface TourState {
  /** Bản sao trạng thái đã lưu ở DB. Nguồn ghi là AuthService. */
  onboarding: OnboardingState;
  /** Tour đang chạy trong tab này. */
  running: boolean;
  stepIndex: number;
  mode: TourMode;
  /** Hộp thoại "Bạn có cần hướng dẫn không?" đang mở. */
  invitationOpen: boolean;
  /** Thanh checklist ở góc bị thu gọn. */
  checklistCollapsed: boolean;
  /**
   * Số lượng tại thời điểm bấm Bắt đầu.
   *
   * ⚠️ Không có cái này thì "Restart tutorial" trên tài khoản đã có 5 workspace
   *    sẽ thấy điều kiện `workspaces >= 1` đúng ngay lập tức và chạy vèo hết 4
   *    bước trong một khung hình. Điều kiện thật là "tăng THÊM so với lúc bắt
   *    đầu", không phải "lớn hơn 0".
   */
  baseline: TourCounts;
  /** Số lượng mới nhất các trang báo về. */
  counts: TourCounts;
}

const initialState: TourState = {
  onboarding: emptyOnboardingState(),
  running: false,
  stepIndex: 0,
  mode: 'full',
  invitationOpen: false,
  checklistCollapsed: false,
  baseline: EMPTY_COUNTS,
  counts: EMPTY_COUNTS,
};

export const TourStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),

  withComputed((store) => ({
    /** Bước đang chạy, hoặc null khi tour không chạy / đã đi hết. */
    currentStep: computed<TourStep | null>(() =>
      store.running() ? (TOUR_STEPS[store.stepIndex()] ?? null) : null,
    ),

    completedCount: computed(() => store.onboarding().completed.length),

    totalSteps: computed(() => TOUR_STEPS.length),

    /**
     * Thanh "Getting started — 2/4" có được hiện không.
     *
     * Hiện cả khi người dùng đã bấm "I'll explore myself": chữ "Không" mà xoá
     * sạch đường quay lại là lỗi thiết kế phổ biến nhất của onboarding. Chỉ ẩn
     * khi đã đi hết, hoặc khi tour đang chạy (lúc đó popover lo rồi).
     */
    checklistVisible: computed(() => {
      const s = store.onboarding();
      return !store.running() && s.status !== 'done' && s.status !== 'not-started';
    }),
  })),

  withMethods((store, auth = inject(AuthService)) => {
    /** Ghi trạng thái mới xuống DB + đồng bộ vào store. Không chờ round-trip. */
    const persist = (patch: Partial<OnboardingState>): OnboardingState => {
      const next: OnboardingState = {
        ...store.onboarding(),
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      patchState(store, { onboarding: next });
      void auth.saveOnboardingState(next);
      return next;
    };

    /** Điều kiện sang bước sau: số lượng đã tăng so với lúc bắt đầu tour. */
    const isStepSatisfied = (step: TourStep): boolean =>
      store.counts()[step.countKey] > store.baseline()[step.countKey];

    return {
      /**
       * Nạp trạng thái đã lưu vào store. Gọi khi `currentUser()` đổi.
       *
       * Không tự bật tour lại ở đây dù `status === 'running'` — người dùng có thể
       * đã đóng tab giữa chừng từ hôm qua; bật lên không hỏi là cưỡng ép. Việc
       * hỏi "Resume?" do hộp mời lo.
       */
      hydrate(state: OnboardingState): void {
        // ⚠️ Đang chạy tour thì KHÔNG cho một trạng thái rỗng ghi đè.
        //
        // `hydrate` chạy mỗi lần `currentUser()` đổi, kể cả khi Firebase làm mới
        // token và app gọi lại `/auth/me`. Nếu lúc đó backend trả về rỗng — cột
        // `onboarding_state` chưa được tạo, hoặc lần ghi trước thất bại — thì
        // người dùng đang ở bước 3 bị đá về `not-started` giữa chừng: popover
        // biến mất, checklist về 0/4, công sức mất sạch.
        //
        // Máy đang chạy tour biết rõ hơn server trong tình huống này. Server chỉ
        // được quyền ghi đè khi nó thật sự mang thông tin.
        if (store.running() && state.status === 'not-started') return;
        patchState(store, { onboarding: state });
      },

      /**
       * Quyết định có mở hộp mời hay không, gọi khi vào trang workspace.
       *
       * Chỉ mời người `not-started` (chưa từng chạy, chưa từ chối) hoặc
       * `running` (đang dở → hỏi có muốn tiếp không). Người đã `done` hoặc
       * `skipped` thì im lặng — họ đã trả lời rồi, hỏi lại là phiền.
       */
      maybeInvite(): void {
        if (store.running() || store.invitationOpen()) return;
        const s = store.onboarding().status;
        if (s === 'not-started' || s === 'running') {
          patchState(store, { invitationOpen: true });
        }
      },

      closeInvitation(): void {
        patchState(store, { invitationOpen: false });
      },

      /** "I'll explore myself" — đóng lại, nhưng KHÔNG mất đường quay lại. */
      declineInvitation(): void {
        patchState(store, { invitationOpen: false });
        persist({ status: 'skipped', currentStep: null });
      },

      /**
       * Bắt đầu (hoặc chạy lại) tour.
       *
       * `counts` hiện tại được chốt làm mốc — xem ghi chú ở `TourState.baseline`.
       */
      start(mode: TourMode = 'full'): void {
        const done = store.onboarding().completed;
        // Chạy tiếp từ bước dở dang đầu tiên, không phải luôn từ bước 1: người
        // bỏ dở ở bước 3 mà bị bắt tạo lại workspace từ đầu sẽ bỏ luôn.
        const firstUnfinished = TOUR_STEPS.findIndex((s) => !done.includes(s.id));
        patchState(store, {
          running: true,
          invitationOpen: false,
          mode,
          stepIndex: firstUnfinished === -1 ? 0 : firstUnfinished,
          baseline: store.counts(),
        });
        persist({
          status: 'running',
          currentStep: TOUR_STEPS[firstUnfinished === -1 ? 0 : firstUnfinished].id,
        });
      },

      /** Chạy lại từ đầu — mục "Restart tutorial" trong Cài đặt. */
      restart(): void {
        patchState(store, {
          running: true,
          invitationOpen: false,
          mode: 'full',
          stepIndex: 0,
          baseline: store.counts(),
        });
        persist({ status: 'running', currentStep: TOUR_STEPS[0].id, completed: [] });
      },

      /** Thoát giữa chừng (Esc, nút Skip). Giữ nguyên các bước đã xong. */
      stop(): void {
        patchState(store, { running: false });
        persist({ status: 'skipped', currentStep: null });
      },

      /** Đi hết 4 bước. */
      finish(): void {
        patchState(store, { running: false });
        persist({
          status: 'done',
          currentStep: null,
          completed: [...TOUR_STEP_IDS],
        });
      },

      /**
       * Các trang báo số lượng hiện có về đây.
       *
       * Nhận `Partial` vì mỗi trang chỉ biết phần của mình: trang workspace biết
       * số workspace và board, trang board biết số list và card. Trang không
       * biết thì đừng gửi — gửi 0 sẽ ghi đè số thật của trang kia.
       */
      observe(counts: Partial<TourCounts>): void {
        const prev = store.counts();
        const merged = { ...prev, ...counts };

        // Không có gì đổi thì KHÔNG ghi. `patchState` với object mới luôn được
        // coi là giá trị mới (signal so sánh tham chiếu), nên ghi vô tội vạ sẽ
        // đánh thức mọi effect đang đọc `counts` — và nếu chỗ gọi quên
        // `untracked()` thì thành vòng lặp vô hạn khoá cứng trang. Chốt chặn ở
        // đây để lỗi đó không thể tái diễn từ một chỗ gọi khác.
        const same =
          prev.workspaces === merged.workspaces &&
          prev.boards === merged.boards &&
          prev.lists === merged.lists &&
          prev.cards === merged.cards;
        if (same) return;

        patchState(store, { counts: merged });

        if (!store.running()) return;
        const step = TOUR_STEPS[store.stepIndex()];
        if (!step) return;
        if (merged[step.countKey] <= store.baseline()[step.countKey]) return;

        // Bước vừa xong → ghi nhận rồi đi tiếp.
        const done = store.onboarding().completed;
        const completed = done.includes(step.id) ? done : [...done, step.id];
        const nextIndex = store.stepIndex() + 1;
        const last = nextIndex >= TOUR_STEPS.length;
        // `basics` dừng sau khi có thẻ đầu tiên — cũng chính là bước cuối của
        // tầng 1, nên hiện tại hai chế độ kết thúc cùng chỗ. Tách sẵn để khi
        // thêm tầng 2 thì `full` đi tiếp mà `basics` thì không.
        const stop = last || (store.mode() === 'basics' && step.id === 'add-card');

        patchState(store, {
          stepIndex: last ? store.stepIndex() : nextIndex,
          running: !stop,
        });
        persist({
          status: stop ? 'done' : 'running',
          currentStep: stop ? null : TOUR_STEPS[nextIndex].id,
          completed,
        });
      },

      /** Nút "Skip this step" — bỏ qua mà không đánh dấu đã xong. */
      skipStep(): void {
        const nextIndex = store.stepIndex() + 1;
        if (nextIndex >= TOUR_STEPS.length) {
          patchState(store, { running: false });
          persist({ status: 'skipped', currentStep: null });
          return;
        }
        patchState(store, { stepIndex: nextIndex, baseline: store.counts() });
        persist({ status: 'running', currentStep: TOUR_STEPS[nextIndex].id });
      },

      back(): void {
        const prev = store.stepIndex() - 1;
        if (prev < 0) return;
        patchState(store, { stepIndex: prev, baseline: store.counts() });
        persist({ status: 'running', currentStep: TOUR_STEPS[prev].id });
      },

      /** Đánh dấu một bước đã xong từ bên ngoài (dùng cho thanh checklist). */
      markDone(id: TourStepId): void {
        const done = store.onboarding().completed;
        if (done.includes(id)) return;
        persist({ completed: [...done, id] });
      },

      isDone(id: TourStepId): boolean {
        return store.onboarding().completed.includes(id);
      },

      toggleChecklist(): void {
        patchState(store, { checklistCollapsed: !store.checklistCollapsed() });
      },

      /**
       * Ẩn hẳn thanh checklist — người dùng dứt khoát không muốn nữa.
       *
       * Tách khỏi `finish()`: `finish()` đánh dấu CẢ BỐN bước là đã xong, dùng
       * cho người thật sự đi hết. Gọi nó khi người ta chỉ bấm "Dismiss" là ghi
       * vào hồ sơ một lời nói dối — checklist hiện 4/4 trong khi họ chưa tạo nổi
       * cái workspace nào, và mọi thống kê onboarding sau này đều sai.
       */
      dismissChecklist(): void {
        persist({ status: 'done', currentStep: null });
      },

      /** Dùng trong test và khi cần biết vị trí một bước. */
      indexOf: stepIndexOf,

      /** Điều kiện của bước hiện tại đã thoả chưa — cho test đọc. */
      currentSatisfied(): boolean {
        const step = TOUR_STEPS[store.stepIndex()];
        return step ? isStepSatisfied(step) : false;
      },
    };
  }),
);
