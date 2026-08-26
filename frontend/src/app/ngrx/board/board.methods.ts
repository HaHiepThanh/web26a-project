import { inject, Signal } from '@angular/core';
import { patchState, WritableStateSource } from '@ngrx/signals';
import { EntityState, upsertEntity } from '@ngrx/signals/entities';
import { describeError } from '../../services/api-error.util';
import { ApiService } from '../../services/api.service';
import { ApiBoard, Board, BoardBackground, BoardVisibility } from '../../models';
import type { ErrorState } from '../shared/error.feature';
import { BoardOwnState } from './board.state';
import { toBoard } from './board.mapper';
import { LocalBoardOverride, persistLocalBoardOverrides } from './board.local-image.util';

type Store = WritableStateSource<EntityState<Board> & BoardOwnState & ErrorState> & {
  entities: Signal<Board[]>;
  boards: Signal<Board[]>;
  workspaceBoardIds: Signal<string[]>;
  allBoardIds: Signal<string[]>;
  localOverrides: Signal<BoardOwnState['localOverrides']>;
};

/** Hàm generic thuần — xem chú thích trong `ngrx/list/list.computed.ts` (và
 *  `ngrx/list/list.methods.ts` về việc `inject(ApiService)` chỉ gọi một lần ở đây). */
export function boardMethods<S extends Store>(store: S, api = inject(ApiService)) {
  /** Ghi xuống localStorage. Vỡ quota (ảnh nền base64 nặng) thì bỏ ảnh, giữ board. */
  function persistOrDropImage(boardId: string): void {
    patchState(store, { storageWarning: null });
    if (persistLocalBoardOverrides(store.localOverrides())) return;
    const local = store.localOverrides()[boardId];
    if (!local?.backgroundImageUrl) return;
    const next = { ...store.localOverrides(), [boardId]: { ...local, backgroundImageUrl: undefined } };
    patchState(store, { localOverrides: next });
    persistLocalBoardOverrides(next);
    patchState(store, { storageWarning: 'Browser storage is full — board was saved but the background image could not be.' });
  }

  function localFor(boardId: string): LocalBoardOverride | undefined {
    return store.localOverrides()[boardId];
  }

  return {
    /** Áp thay đổi board nhận từ WebSocket — chỉ `name`/`visibility`, màu/ảnh
     *  nền vẫn ở localStorage (server chưa lưu được ảnh). */
    applyRemoteBoard(r: ApiBoard): void {
      // ⚠️ Dữ liệu SERVER thắng. Trước đây dòng này là
      //    `{ ...merged, ...current, name, visibility }` — tức bản CŨ ở local
      //    được spread SAU nên đè ngược lên dữ liệu vừa nhận, và chỉ `name` với
      //    `visibility` được cứu ra tường minh. Mọi thay đổi khác đến qua
      //    WebSocket đều bị vứt lặng lẽ: người kia mở cuộc họp mà mình không
      //    thấy nút "Join meeting" hiện lên, phải F5 mới có.
      //
      //    `toBoard` đã lo phần dự phòng localStorage rồi, và `upsertEntity`
      //    vốn GỘP chứ không thay thế, nên không cần giữ `current` làm gì.
      patchState(store, upsertEntity(toBoard(r, localFor(r.id))));
    },

    async loadBoards(workspaceId: string): Promise<void> {
      if (!workspaceId) {
        patchState(store, { workspaceBoardIds: [] });
        return;
      }
      patchState(store, { loading: true, loadError: null });
      try {
        const rows = await api.get<ApiBoard[]>(`/boards?workspaceId=${workspaceId}`);
        for (const row of rows) patchState(store, upsertEntity(toBoard(row, localFor(row.id))));
        patchState(store, { workspaceBoardIds: rows.map((r) => r.id), loading: false });
      } catch (e) {
        patchState(store, { loadError: describeError(e, 'Failed to load boards.'), workspaceBoardIds: [], loading: false });
      }
    },

    /** Gộp board của TẤT CẢ workspace — Dashboard Chat hub liệt kê mọi hội thoại. */
    async loadAllBoards(workspaceIds: string[] = []): Promise<void> {
      if (!workspaceIds.length) {
        patchState(store, { allBoardIds: [] });
        return;
      }
      const perWorkspace = await Promise.all(
        workspaceIds.map((id) => api.get<ApiBoard[]>(`/boards?workspaceId=${id}`).catch(() => [] as ApiBoard[])),
      );
      const rows = perWorkspace.flat();
      for (const row of rows) patchState(store, upsertEntity(toBoard(row, localFor(row.id))));
      patchState(store, { allBoardIds: rows.map((r) => r.id) });
    },

    async loadBoard(boardId: string): Promise<void> {
      patchState(store, { loadError: null });
      try {
        const row = await api.get<ApiBoard>(`/boards/${boardId}`);
        patchState(store, upsertEntity(toBoard(row, localFor(row.id))), { currentBoardId: row.id });
      } catch (e) {
        // 404 = không tồn tại HOẶC không thuộc tổ chức của mình (backend cố ý gộp
        // hai trường hợp để người ngoài không dò được id nào có thật).
        patchState(store, { currentBoardId: null, loadError: describeError(e, 'Failed to open board.') });
      }
    },

    /**
     * Đẩy ảnh nền lên Storage để MỌI thành viên đều thấy.
     *
     * Modal đưa xuống một data URL (đã nén sẵn), đổi lại thành file rồi gửi
     * multipart. Trả về link ký của server, hoặc `null` khi hỏng.
     *
     * Dùng CHUNG cho cả tạo mới lẫn sửa — thiếu một trong hai là lỗi cũ còn
     * nguyên ở đường đó: trước đây ảnh chỉ nằm ở localStorage của người đặt nên
     * người khác mở cùng board thì trắng trơn.
     */
    async taiAnhNen(boardId: string, dataUrl: string): Promise<string | null> {
      const blob = await (await fetch(dataUrl)).blob();
      const form = new FormData();
      form.append('file', blob, 'background.png');
      const row = await api.upload<ApiBoard>(`/boards/${boardId}/background`, form);
      return row.backgroundImageUrl ?? null;
    },

    async createBoard(
      workspaceId: string,
      name: string,
      options?: { visibility?: BoardVisibility; memberIds?: string[]; background?: BoardBackground; backgroundImageUrl?: string },
    ): Promise<Board | null> {
      const title = name.trim();
      if (!title) return null;

      let row: ApiBoard;
      try {
        // Id do SERVER cấp. Quyền riêng tư + danh sách người xem gửi LUÔN trong POST.
        row = await api.post<ApiBoard>('/boards', {
          workspaceId,
          name: title,
          visibility: options?.visibility ?? 'workspace',
          ...(options?.visibility === 'private' ? { memberIds: options.memberIds ?? [] } : {}),
        });
        if (options?.background) {
          try {
            row = await api.patch<ApiBoard>(`/boards/${row.id}`, { background: options.background });
          } catch {
            patchState(store, { loadError: 'Board created, but background color failed to save.' });
          }
        }
      } catch (e) {
        patchState(store, { loadError: describeError(e, 'Failed to create board.') });
        return null;
      }

      // ẢNH nền lên Storage ngay khi tạo. Hỏng thì board vẫn còn (đã tạo xong ở
      // trên) — chỉ báo lỗi nền, không huỷ cả board vì một tấm ảnh.
      let urlAnhNen: string | undefined;
      if (options?.backgroundImageUrl?.startsWith('data:')) {
        try {
          urlAnhNen = (await this.taiAnhNen(row.id, options.backgroundImageUrl)) ?? undefined;
        } catch {
          patchState(store, { loadError: 'Board created, but the background image failed to upload.' });
        }
      }

      // MÀU nền vẫn giữ bản local làm đường lui. ẢNH thì không: đã có trên
      // server rồi thì bản local chỉ là rác chiếm quota localStorage.
      const local: LocalBoardOverride = {
        background: options?.background,
        backgroundImageUrl: urlAnhNen ? undefined : options?.backgroundImageUrl,
      };
      const nextOverrides = { ...store.localOverrides(), [row.id]: local };
      patchState(store, { localOverrides: nextOverrides });
      const board = toBoard({ ...row, backgroundImageUrl: urlAnhNen ?? row.backgroundImageUrl }, local);
      patchState(store, upsertEntity(board), { workspaceBoardIds: [...store.workspaceBoardIds(), row.id] });
      persistOrDropImage(row.id);
      return board;
    },

    /**
     * Lưu link Meet lên server để MỌI thành viên vào cùng một phòng.
     *
     * Không tạo phòng ở đây — việc đó do `GoogleMeetService` làm trong trình
     * duyệt của chủ board. Hàm này chỉ chở đúng một chuỗi URL đã có sẵn.
     *
     * Backend phát `board.updated` sau khi ghi, nên người đang mở board thấy nút
     * đổi thành "Vào họp" ngay, không phải F5.
     */
    async luuLinkMeet(id: string, meetUrl: string | null): Promise<string | null> {
      try {
        const row = await api.patch<ApiBoard>(`/boards/${id}`, { meetUrl });
        const cu = store.entities().find((b) => b.id === id);
        if (cu) {
          // ⚠️ Gán `undefined` TƯỜNG MINH, KHÔNG dùng `delete`.
          //    `upsertEntity` gộp bằng `{ ...cũ, ...mới }` (xem
          //    `setEntityMutably` với `replace = false`). `delete` làm khoá
          //    VẮNG MẶT khỏi object, mà khoá vắng mặt thì phép gộp giữ nguyên
          //    giá trị cũ — nên đóng cuộc họp xong link vẫn còn, phải F5 mới
          //    thấy nút "Start meeting" quay lại. Khoá có mặt mang giá trị
          //    `undefined` thì mới ghi đè được.
          const moi: Board = {
            ...cu,
            meetUrl: row.meetUrl ?? undefined,
            meetCreatedBy: row.meetCreatedBy ?? undefined,
          };
          patchState(store, upsertEntity(moi));
        }
        return null;
      } catch (e) {
        return describeError(e, 'Could not save the meeting link.');
      }
    },

    async updateBoard(
      id: string,
      changes: Partial<Pick<Board, 'name' | 'visibility' | 'background' | 'backgroundImageUrl'>>,
    ): Promise<string | null> {
      const patch: { name?: string; visibility?: BoardVisibility; background?: string | null } = {};
      if (changes.name !== undefined) patch.name = changes.name;
      if (changes.visibility !== undefined) patch.visibility = changes.visibility;
      // MÀU nền giờ xuống database. Gửi `null` khi người dùng gỡ nền về mặc định.
      if (changes.background !== undefined) patch.background = changes.background ?? null;

      if (Object.keys(patch).length > 0) {
        try {
          await api.patch<ApiBoard>(`/boards/${id}`, patch);
        } catch (e) {
          return describeError(e, 'Failed to update board.');
        }
      }

      // ẢNH nền: đẩy lên Storage qua endpoint riêng để MỌI thành viên đều thấy.
      //
      // Trước đây ảnh chỉ được nhét vào localStorage nên chỉ người đặt nhìn
      // thấy — người khác mở cùng board thì trắng trơn. Modal đưa xuống một
      // data URL (đã nén), đổi lại thành file rồi gửi multipart.
      if (changes.backgroundImageUrl?.startsWith('data:')) {
        try {
          const urlMoi = await this.taiAnhNen(id, changes.backgroundImageUrl);
          const row = { backgroundImageUrl: urlMoi };
          const existingBoard = store.entities().find((b) => b.id === id);
          if (existingBoard) {
            // Dựng rồi mới gán, không spread thẳng `?? undefined`: `Board` khai
            // trường này là optional, còn spread một giá trị `undefined` tường
            // minh lại biến nó thành bắt buộc-mà-rỗng — TypeScript từ chối.
            const moi: Board = {
              ...existingBoard,
              backgroundImageUrl: row.backgroundImageUrl ?? undefined,
            };
            patchState(store, upsertEntity(moi));
          }
          // Đã có bản trên server thì bản localStorage chỉ còn là rác chiếm quota.
          const { [id]: _bo, ...conLai } = store.localOverrides();
          patchState(store, { localOverrides: conLai });
          return null;
        } catch (e) {
          return describeError(e, 'Failed to upload the background image.');
        }
      }

      // GỠ ảnh nền. Phải xoá cả trên SERVER, không chỉ ở máy mình.
      //
      // `'backgroundImageUrl' in changes` chứ không `=== undefined`: hai thứ đó
      // khác nhau — "không đụng tới trường này" và "vừa bấm gỡ ảnh" đều cho ra
      // `undefined`, chỉ có sự hiện diện của khoá mới phân biệt được. Đoán sai
      // thì mỗi lần đổi tên board là ảnh nền tự bay mất.
      //
      // Không xoá trên server thì `backgroundImageByBoardId` — nay ưu tiên bản
      // server — vẫn dựng lại đúng tấm ảnh vừa gỡ.
      if ('backgroundImageUrl' in changes && !changes.backgroundImageUrl) {
        const existingBoard = store.entities().find((b) => b.id === id);
        if (existingBoard?.backgroundImageUrl) {
          try {
            await api.patch<ApiBoard>(`/boards/${id}`, { backgroundImagePath: null });
            // `undefined` tường minh, không `delete` — xem chú thích trong
            // `luuLinkMeet` về việc `upsertEntity` gộp chứ không thay thế.
            const moi: Board = { ...existingBoard, backgroundImageUrl: undefined };
            patchState(store, upsertEntity(moi));
          } catch (e) {
            return describeError(e, 'Failed to remove the background image.');
          }
        }
      }

      const currentLocal = store.localOverrides()[id];
      if (changes.background !== undefined || changes.backgroundImageUrl !== undefined) {
        const nextLocal: LocalBoardOverride = {
          background: changes.background !== undefined ? changes.background : currentLocal?.background,
          backgroundImageUrl: changes.backgroundImageUrl !== undefined ? changes.backgroundImageUrl : currentLocal?.backgroundImageUrl,
        };
        patchState(store, { localOverrides: { ...store.localOverrides(), [id]: nextLocal } });
      }

      const existing = store.entities().find((b) => b.id === id);
      if (existing) patchState(store, upsertEntity({ ...existing, ...changes }));
      persistOrDropImage(id);
      return null;
    },

    async deleteBoard(id: string): Promise<string | null> {
      // Xoá trên server TRƯỚC — xoá giao diện trước rồi server hỏng là màn hình
      // lệch với database cho tới lần F5 kế tiếp.
      try {
        await api.delete(`/boards/${id}`);
      } catch (e) {
        return describeError(e, 'Failed to delete board.');
      }
      patchState(store, {
        workspaceBoardIds: store.workspaceBoardIds().filter((x) => x !== id),
        allBoardIds: store.allBoardIds().filter((x) => x !== id),
      });
      const nextOverrides = { ...store.localOverrides() };
      delete nextOverrides[id];
      patchState(store, { localOverrides: nextOverrides });
      persistLocalBoardOverrides(nextOverrides);
      return null;
    },
  };
}
