import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { ActivityService } from '../activity/activity.service';
import { UpdateCardDto } from './dto/update-card.dto';

/** CRUD card + kéo thả giữa/trong list (#4). */
@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly activity: ActivityService,
  ) {}

  async findAll(boardId: string): Promise<unknown[]> {
    const sb = this.supabase.client;

    const { data: lists } = await sb.from('lists').select('id').eq('board_id', boardId);

    if (!lists?.length) return [];

    const listIds = lists.map((l) => l.id);

    const { data, error } = await sb
      .from('cards')
      .select('*')
      .in('list_id', listIds)
      .order('position', { ascending: true });

    if (error) {
      this.logger.error(`Đọc danh sách thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không đọc được danh sách thẻ');
    }

    return data;
  }

  async create(listId: string, title: string, uid: string): Promise<unknown> {
    const sb = this.supabase.client;

    const { data: list } = await sb
      .from('lists')
      .select('id, org_id, board_id')
      .eq('id', listId)
      .maybeSingle();

    if (!list) throw new NotFoundException('Không tìm thấy cột.');

    const { data: last } = await sb
      .from('cards')
      .select('position')
      .eq('list_id', listId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    const position = last ? last.position + 1 : 1;

    const { data, error } = await sb
      .from('cards')
      .insert({
        org_id: list.org_id,
        list_id: listId,
        title,
        position,
        created_by: uid,
      })
      .select()
      .single();

    if (error) {
      this.logger.error(`Tạo thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không tạo được thẻ');
    }

    await this.activity.record(list.board_id, uid, 'card_created', `Đã tạo thẻ "${title}"`, data.id);

    return data;
  }

  async update(id: string, changes: UpdateCardDto): Promise<unknown> {
    const sb = this.supabase.client;

    const { data: card } = await sb.from('cards').select('id').eq('id', id).maybeSingle();
    if (!card) throw new NotFoundException('Không tìm thấy thẻ.');

    const patch: Record<string, unknown> = {};
    if (changes.title !== undefined) patch.title = changes.title;
    if (changes.description !== undefined) patch.description = changes.description;
    if (changes.priority !== undefined) patch.priority = changes.priority;
    if (changes.dueDate !== undefined) patch.due_date = changes.dueDate;
    if (changes.assigneeId !== undefined) patch.assignee_id = changes.assigneeId;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('Không có gì để cập nhật.');
    }

    const { data, error } = await sb
      .from('cards')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Cập nhật thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không cập nhật được thẻ');
    }

    return data;
  }

  async move(id: string, toListId: string, position: number, uid: string): Promise<unknown> {
    const sb = this.supabase.client;

    const { data: card } = await sb
      .from('cards')
      .select('id, org_id, list_id, title')
      .eq('id', id)
      .maybeSingle();
    if (!card) throw new NotFoundException('Không tìm thấy thẻ.');

    const { data: toList } = await sb
      .from('lists')
      .select('id, org_id, board_id')
      .eq('id', toListId)
      .maybeSingle();
    if (!toList) throw new NotFoundException('Không tìm thấy cột đích.');

    if (toList.org_id !== card.org_id) {
      throw new ForbiddenException('Không thể chuyển thẻ sang tổ chức khác.');
    }

    const { data, error } = await sb
      .from('cards')
      .update({ list_id: toListId, position })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      this.logger.error(`Chuyển thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không chuyển được thẻ');
    }

    await this.activity.record(toList.board_id, uid, 'card_moved', `Đã chuyển thẻ "${card.title}"`, id);

    return data;
  }

  async remove(id: string): Promise<void> {
    const sb = this.supabase.client;

    const { data: card } = await sb.from('cards').select('id').eq('id', id).maybeSingle();
    if (!card) throw new NotFoundException('Không tìm thấy thẻ.');

    const { error } = await sb.from('cards').delete().eq('id', id);

    if (error) {
      this.logger.error(`Xoá thẻ thất bại: ${error.message}`);
      throw new InternalServerErrorException('Không xoá được thẻ');
    }
  }
}
