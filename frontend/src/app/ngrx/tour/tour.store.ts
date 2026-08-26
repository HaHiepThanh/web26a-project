import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import {
  OnboardingState,
  TOUR_STEP_IDS,
  TourStepId,
  emptyOnboardingState,
} from '../../models';
import { AuthService } from '../../services/auth.service';
import { RouteContextStore } from '../route-context/route-context.store';
import {
  EMPTY_COUNTS,
  EMPTY_FLAGS,
  FIRST_TIER_2_INDEX,
  TOUR_STEPS,
  TourCounts,
  TourFlags,
  TourStep,
  stepIndexOf,
} from './tour.steps';
import { TourSeedService } from './tour.seed';

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
  /**
   * `baseline` của từng loại số có đáng tin không.
   *
   * Chốt mốc khi chưa biết số thật là chốt bằng 0, và rồi mọi thứ vốn đã tồn tại
   * đều bị tính thành "người dùng vừa làm được". Hai đường dẫn tới tình huống đó:
   *
   *   - Bắt đầu tour ở trang KHÔNG báo số nào (nút "Restart tutorial" nằm trong
   *     Cài đặt, mà vào Cài đặt là tải lại app).
   *   - Đi từ trang workspace sang trang board. Trang workspace chỉ báo
   *     `workspaces` và `boards`; `lists`/`cards` mãi tới khi mở board mới có.
   *     Board đã sẵn 3 cột 8 thẻ là bước 3 lẫn bước 4 thoả trong một khung hình.
   *
   * Đường thứ hai chính là lý do phải theo TỪNG LOẠI SỐ chứ không một cờ chung.
   * Lần báo đầu tiên của mỗi loại chỉ dùng để dựng mốc, không tính là tiến độ.
   */
  baselineFresh: Partial<Record<keyof TourCounts, boolean>>;
  /** Loại số nào đã từng được trang nào đó báo về, kể từ khi app tải. */
  countsSeen: Partial<Record<keyof TourCounts, boolean>>;
  /** Số lượng mới nhất các trang báo về. */
  counts: TourCounts;
  /** Trạng thái bật/tắt mới nhất các trang báo về (tầng 2). */
  flags: TourFlags;

  // ---- Tầng 2 ----
  /** Hộp hỏi "gieo 8 thẻ mẫu nhé?" đang mở. */
  seedOfferOpen: boolean;
  /** Hộp hỏi "xoá thẻ mẫu đi nhé?" đang mở. */
  cleanupOfferOpen: boolean;
  /** Đang gọi API gieo/dọn — khoá nút để không bấm hai lần. */
  seedBusy: boolean;
}

const initialState: TourState = {
  onboarding: emptyOnboardingState(),
  running: false,
  stepIndex: 0,
  mode: 'full',
  invitationOpen: false,
  checklistCollapsed: false,
  baseline: EMPTY_COUNTS,
  baselineFresh: {},
  countsSeen: {},
  counts: EMPTY_COUNTS,
  flags: EMPTY_FLAGS,
  seedOfferOpen: false,
  cleanupOfferOpen: false,
  seedBusy: false,
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

    /**
     * Tổng số bước THEO CHẾ ĐỘ đang chạy.
     *
     * "Just the basics" dừng sau bước 4, nên hiện "Step 2 of 7" cho họ là hứa
     * một hành trình dài gấp đôi thứ họ vừa chọn — rồi tour tắt ở bước 4 làm
     * người ta tưởng nó hỏng.
     */
    totalSteps: computed(() =>
      store.mode() === 'basics' ? FIRST_TIER_2_INDEX : TOUR_STEPS.length,
    ),

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

  withMethods((
    store,
    auth = inject(AuthService),
    seeder = inject(TourSeedService),
    route = inject(RouteContextStore),
  ) => {
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

    /**
     * Điều kiện sang bước sau.
     *
     * Tầng 1 so SỐ LƯỢNG với mốc chốt lúc bắt đầu — "tăng thêm", không phải
     * "lớn hơn 0". Tầng 2 chỉ cần một CỜ bật lên, vì nó không tạo dữ liệu mới.
     */
    const isStepSatisfied = (step: TourStep): boolean =>
      step.advance.on === 'count'
        ? store.counts()[step.advance.key] > store.baseline()[step.advance.key]
        : store.flags()[step.advance.key];

    /**
     * Bước hiện tại vừa thoả điều kiện thì ghi nhận và đi tiếp.
     *
     * Ba lối rẽ ở cuối tầng 1, và đây là chỗ dễ sai nhất:
     *
     *   - chế độ `basics` → dừng hẳn, đúng như đã hứa trong hộp mời.
     *   - chế độ `full`   → KHÔNG nhảy thẳng sang bước 5. Bước 5 dạy bộ lọc, mà
     *     board lúc này có đúng một thẻ do người dùng vừa tạo; lọc 1/1 thẻ thì
     *     chẳng dạy được gì. Phải hỏi gieo dữ liệu mẫu trước.
     *   - hết bước       → xong tour, và hỏi dọn thẻ mẫu nếu có gieo.
     */
    const advanceOnce = (): boolean => {
      if (!store.running()) return false;
      const step = TOUR_STEPS[store.stepIndex()];
      if (!step || !isStepSatisfied(step)) return false;

      const done = store.onboarding().completed;
      const completed = done.includes(step.id) ? done : [...done, step.id];
      const nextIndex = store.stepIndex() + 1;
      const het = nextIndex >= TOUR_STEPS.length;
      const hetTang1 = step.tier === 1 && nextIndex === FIRST_TIER_2_INDEX;

      if (het) {
        patchState(store, { running: false });
        persist({ status: 'done', currentStep: null, completed });
        const seeded = store.onboarding().seeded;
        if (seeded && seeded.cardIds.length) {
          patchState(store, { cleanupOfferOpen: true });
        }
        return false;
      }

      if (hetTang1 && store.mode() === 'basics') {
        patchState(store, { running: false });
        persist({ status: 'done', currentStep: null, completed });
        return false;
      }

      if (hetTang1) {
        // Tạm dừng tour (ẩn lớp phủ) trong lúc hộp hỏi đang mở, rồi mới sang
        // bước 5 nếu người dùng đồng ý gieo.
        patchState(store, { running: false, seedOfferOpen: true });
        persist({ status: 'running', currentStep: TOUR_STEPS[nextIndex].id, completed });
        return false;
      }

      patchState(store, { stepIndex: nextIndex });
      persist({ status: 'running', currentStep: TOUR_STEPS[nextIndex].id, completed });
      return true;
    };

    /**
     * Đi tiếp cho tới khi không đi được nữa — KHÔNG phải chỉ một bước.
     *
     * Vì điều kiện của bước kế tiếp có thể ĐÃ thoả từ trước. Ví dụ thật: trạng
     * thái thu gọn của khung chat được nhớ trong localStorage
     * (`trello_chat_panel_collapsed`), nên người đang để chat mở sẵn thì tới
     * bước "open-chat" cờ `chatOpen` vốn đã bật. Không có gì "thay đổi" để đánh
     * thức, và tour đứng ở bước đó vĩnh viễn trong khi việc cần làm đã xong rồi.
     *
     * Chặn số vòng để một lỗi logic trong `isStepSatisfied` không thành vòng lặp
     * vô hạn khoá cứng trang — đúng loại sự cố đã xảy ra một lần với `observe()`.
     */
    const tryAdvance = (): void => {
      for (let i = 0; i < TOUR_STEPS.length; i++) {
        if (!advanceOnce()) return;
      }
    };

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
        const target = firstUnfinished === -1 ? 0 : firstUnfinished;

        // Chạy tiếp vào giữa tầng 2 mà chưa từng gieo dữ liệu — hỏi gieo trước.
        //
        // Xảy ra khi người dùng tải lại trang đúng lúc hộp "thêm 8 thẻ mẫu?"
        // đang mở: hộp đó chỉ nằm trong bộ nhớ nên mất theo, còn `currentStep`
        // đã kịp ghi là bước 5. Không có nhánh này thì họ quay lại và bị dạy bộ
        // lọc trên một board đúng một thẻ — thứ mà cả tầng 2 sinh ra để tránh.
        if (mode === 'full' && target >= FIRST_TIER_2_INDEX && !store.onboarding().seeded) {
          patchState(store, { running: false, invitationOpen: false, mode, seedOfferOpen: true });
          persist({ status: 'running', currentStep: TOUR_STEPS[FIRST_TIER_2_INDEX].id });
          return;
        }

        patchState(store, {
          running: true,
          invitationOpen: false,
          mode,
          stepIndex: target,
          baseline: store.counts(),
          baselineFresh: { ...store.countsSeen() },
        });
        persist({ status: 'running', currentStep: TOUR_STEPS[target].id });
      },

      /** Chạy lại từ đầu — mục "Restart tutorial" trong Cài đặt. */
      restart(): void {
        patchState(store, {
          running: true,
          invitationOpen: false,
          mode: 'full',
          stepIndex: 0,
          baseline: store.counts(),
          baselineFresh: { ...store.countsSeen() },
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
        // Những loại số VỪA ĐƯỢC BÁO trong lượt này.
        const keys = Object.keys(counts) as (keyof TourCounts)[];

        // "Loại số này đã được báo" là thông tin RIÊNG, không phụ thuộc giá trị
        // có đổi hay không — một trang báo đúng bằng giá trị cũ vẫn chứng minh
        // rằng ta đã biết số thật. Ghi trước chốt chặn "không đổi thì bỏ qua".
        const seen = { ...store.countsSeen() };
        let seenChanged = false;
        for (const k of keys) {
          if (!seen[k]) {
            seen[k] = true;
            seenChanged = true;
          }
        }

        // Loại số nào mốc chưa đáng tin thì lượt báo này chỉ dùng để DỰNG MỐC.
        const fresh = { ...store.baselineFresh() };
        const baseline = { ...store.baseline() };
        let freshChanged = false;
        for (const k of keys) {
          if (!fresh[k]) {
            fresh[k] = true;
            baseline[k] = merged[k];
            freshChanged = true;
          }
        }

        if (seenChanged || freshChanged) {
          patchState(store, {
            countsSeen: seen,
            ...(freshChanged ? { baselineFresh: fresh, baseline } : {}),
          });
        }

        const same =
          prev.workspaces === merged.workspaces &&
          prev.boards === merged.boards &&
          prev.lists === merged.lists &&
          prev.cards === merged.cards;
        if (same) return;

        patchState(store, { counts: merged });
        // Vừa dựng mốc xong thì không có gì để tính là tiến độ trong chính lượt
        // đó — mốc bằng đúng giá trị hiện tại nên `isStepSatisfied` tự trả false.
        tryAdvance();
      },

      /**
       * Trang báo về trạng thái bật/tắt của Filter, Chat, AI (tầng 2).
       *
       * Tách khỏi `observe()` vì bản chất khác: `observe` so số lượng với mốc
       * đầu tour, còn ở đây chỉ cần cờ bật lên là xong. Cùng một chốt chặn
       * "không đổi thì không ghi" — lý do y hệt, xem `observe()`.
       */
      observeFlags(flags: Partial<TourFlags>): void {
        const prev = store.flags();
        const merged = { ...prev, ...flags };
        if (
          prev.filterOpen === merged.filterOpen &&
          prev.chatOpen === merged.chatOpen &&
          prev.aiOpen === merged.aiOpen
        ) {
          return;
        }
        patchState(store, { flags: merged });
        tryAdvance();
      },

      // ------------------------------------------------------ tầng 2: gieo/dọn

      /**
       * "Có, thêm 8 thẻ mẫu" — gieo qua API thật rồi vào bước 5.
       *
       * Cờ `seedBusy` khoá nút trong lúc chạy: gieo là 3 cột + 8 thẻ + 3 tin
       * nhắn, mất vài giây, và bấm hai lần là board có 16 thẻ mẫu.
       */
      async acceptSeed(): Promise<void> {
        if (store.seedBusy()) return;
        const boardId = route.activeBoardId();
        if (!boardId) {
          // Không biết đang ở board nào thì không gieo bừa. Bỏ qua tầng 2 còn
          // hơn tạo dữ liệu vào nhầm chỗ.
          patchState(store, { seedOfferOpen: false });
          persist({ status: 'done', currentStep: null });
          return;
        }

        patchState(store, { seedBusy: true });
        let result;
        try {
          result = await seeder.seed(boardId);
        } catch {
          result = null;
        }
        patchState(store, {
          seedBusy: false,
          seedOfferOpen: false,
          running: true,
          stepIndex: FIRST_TIER_2_INDEX,
          // Mốc mới cho tầng 2: số thẻ vừa tăng vọt vì chính ta gieo vào, giữ
          // mốc cũ thì mọi điều kiện đếm còn lại thoả ngay lập tức.
          baseline: store.counts(),
        });
        persist({
          status: 'running',
          currentStep: TOUR_STEPS[FIRST_TIER_2_INDEX].id,
          seeded: result ?? null,
        });
      },

      /** "Không, cảm ơn" — kết thúc tour ở cuối tầng 1. */
      declineSeed(): void {
        patchState(store, { seedOfferOpen: false, running: false });
        // Dạy Filter/Chat/AI trên board một thẻ là nói vào khoảng không, nên từ
        // chối gieo cũng là từ chối tầng 2. Không cố dẫn tiếp cho đủ bước.
        persist({ status: 'done', currentStep: null });
      },

      /** "Có, xoá thẻ mẫu đi" — dọn đúng những gì mình đã tạo. */
      async acceptCleanup(): Promise<void> {
        if (store.seedBusy()) return;
        const seeded = store.onboarding().seeded;
        patchState(store, { seedBusy: true });
        if (seeded) {
          try {
            await seeder.cleanup(seeded);
          } catch {
            /* dọn dở còn hơn không dọn; người dùng xoá tay được */
          }
        }
        patchState(store, { seedBusy: false, cleanupOfferOpen: false });
        persist({ seeded: null });
      },

      /**
       * "Giữ lại" — không dọn.
       *
       * Vẫn xoá `seeded` khỏi hồ sơ: người dùng đã quyết định giữ, nên từ giờ
       * mấy thẻ đó là của họ. Còn lưu id thì lần chạy tour sau sẽ hỏi dọn lại
       * những thẻ họ đã cố ý giữ.
       */
      declineCleanup(): void {
        patchState(store, { cleanupOfferOpen: false });
        persist({ seeded: null });
      },

      /** Nút "Skip this step" — bỏ qua mà không đánh dấu đã xong. */
      skipStep(): void {
        const step = TOUR_STEPS[store.stepIndex()];
        const nextIndex = store.stepIndex() + 1;
        if (nextIndex >= TOUR_STEPS.length) {
          patchState(store, { running: false });
          // Bước cuối là bước TUỲ CHỌN thì bỏ qua nó vẫn là đi hết tour.
          // Đánh dấu "skipped" ở đây nghĩa là mọi môi trường chưa bật Gemini sẽ
          // ghi nhận thất bại cho người dùng đã làm đủ sáu bước — và bỏ luôn
          // phần hỏi dọn thẻ mẫu, để lại 8 thẻ rác trên board của họ.
          persist({
            status: step?.optional ? 'done' : 'skipped',
            currentStep: null,
          });
          const seeded = store.onboarding().seeded;
          if (step?.optional && seeded && seeded.cardIds.length) {
            patchState(store, { cleanupOfferOpen: true });
          }
          return;
        }

        // Bỏ qua bước cuối tầng 1 vẫn phải dừng ở ranh giới như khi làm xong nó.
        // Không có nhánh này thì bấm Skip ở bước 4 là rơi thẳng vào bước 5 với
        // một board trống — tức đi dạy bộ lọc trên đúng thứ mà cả tầng 2 sinh ra
        // để tránh, và cuối tour lại hỏi "xoá thẻ mẫu?" trong khi chưa gieo gì.
        if (step?.tier === 1 && nextIndex === FIRST_TIER_2_INDEX) {
          // ⚠️ CHƯA TỰ TẠO THẺ THÌ KHÔNG GIEO.
          //
          // Cả tầng 1 tồn tại để người dùng tự tay làm ra thứ đầu tiên của mình.
          // Bấm Skip ở bước tạo thẻ rồi lại đổ 8 thẻ mẫu vào là lấy mất đúng cái
          // khoảnh khắc đó: board đầy thẻ của người khác, còn họ thì chưa hề tạo
          // gì. Thà kết thúc tour ở đây, thanh checklist vẫn còn để quay lại.
          const daTuTaoThe = store.onboarding().completed.includes('add-card');
          if (store.mode() === 'basics' || !daTuTaoThe) {
            patchState(store, { running: false });
            persist({ status: 'skipped', currentStep: null });
            return;
          }
          patchState(store, { running: false, seedOfferOpen: true });
          persist({ status: 'running', currentStep: TOUR_STEPS[nextIndex].id });
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