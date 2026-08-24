import { IsNumber } from 'class-validator';

export class MoveListDto {
  /**
   * `position` là số THỰC chứ không phải số nguyên: kéo một cột vào giữa hai cột
   * khác chỉ cần lấy trung điểm, khỏi đánh số lại cả hàng.
   */
  @IsNumber({}, { message: 'position must be a number.' })
  position: number;
}
