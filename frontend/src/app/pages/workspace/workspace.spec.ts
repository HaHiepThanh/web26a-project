import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { Workspace } from './workspace';
import { BoardStore } from '../../ngrx/board/board.store';
import { WorkspaceItem } from '../../models';

describe('Workspace', () => {
  let component: Workspace;
  let fixture: ComponentFixture<Workspace>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Workspace],
    }).compileComponents();

    fixture = TestBed.createComponent(Workspace);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('tao board — chan double-click', () => {
    const WS_ID = 'ws-1';

    // Tạo xong thì hàm điều hướng sang board mới, mà TestBed không nạp bảng
    // route nào — `navigate` sẽ ném NG04002 ra ngoài dưới dạng unhandled
    // rejection. Nó không làm test đỏ, nhưng vitest cảnh báo là có thể sinh
    // "false positive", nên chặn ngay chứ không để lẫn vào output.
    beforeEach(() => {
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    });

    /** Workspace tối thiểu đủ để `handleBoardSubmit` không thoát sớm. */
    const workspace = (): WorkspaceItem => ({
      id: WS_ID,
      name: 'Nhom 1',
      description: '',
      membersCount: 0,
      members: [],
      boards: [],
    });

    const duLieuGui = () => ({
      title: '2two',
      workspaceId: WS_ID,
      privacy: 'Workspace' as const,
      background: 'bg-board-red' as const,
      selectedMemberIds: [],
    });

    /**
     * Giả lập độ trễ mạng: đây chính là khoảng người dùng bấm thêm mấy lần.
     * Không có độ trễ thì lỗi không tái hiện được — lượt đầu đã xong trước khi
     * lượt hai kịp bắt đầu.
     */
    function stubCreateBoard() {
      const store = TestBed.inject(BoardStore);
      let moKhoa: (() => void) | undefined;
      const dangCho = new Promise<void>((res) => (moKhoa = res));
      const spy = vi
        .spyOn(store, 'createBoard')
        .mockImplementation(async () => {
          await dangCho;
          return { id: 'board-moi' } as never;
        });
      return { spy, xong: () => moKhoa?.() };
    }

    it('bam 5 lan lien tuc trong luc cho chi tao DUNG MOT board', async () => {
      component.workspaces.set([workspace()]);
      const { spy, xong } = stubCreateBoard();

      // Năm cú bấm dồn dập, không chờ nhau — đúng cảnh chuột nhảy đúp.
      const cacLuot = [1, 2, 3, 4, 5].map(() => component.handleBoardSubmit(duLieuGui()));

      expect(spy).toHaveBeenCalledTimes(1);

      xong();
      await Promise.all(cacLuot);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('nha co sau khi xong, lan tao ke tiep van chay duoc', async () => {
      component.workspaces.set([workspace()]);
      const { spy, xong } = stubCreateBoard();

      const luot1 = component.handleBoardSubmit(duLieuGui());
      xong();
      await luot1;

      expect(component.creatingBoard()).toBe(false);

      await component.handleBoardSubmit(duLieuGui());
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('backend nem loi thi co van duoc nha, khong khoa nut vinh vien', async () => {
      component.workspaces.set([workspace()]);
      const store = TestBed.inject(BoardStore);
      vi.spyOn(store, 'createBoard').mockRejectedValue(new Error('mat mang'));

      await expect(component.handleBoardSubmit(duLieuGui())).rejects.toThrow('mat mang');
      expect(component.creatingBoard()).toBe(false);
    });

    it('khong tim thay workspace cung phai nha co', async () => {
      component.workspaces.set([]); // id gửi lên không khớp workspace nào

      await component.handleBoardSubmit(duLieuGui());
      expect(component.creatingBoard()).toBe(false);
    });
  });
});
