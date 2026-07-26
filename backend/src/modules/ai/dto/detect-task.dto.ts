import {
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Contract PHẢI khớp với frontend (ai-task-detection.model.ts).

export class DetectTaskMemberDto {
  @IsString() id!: string; // userId (Firebase uid)
  @IsString() displayName!: string;
}

// FE -> BE (body của POST /ai/detect-task)
export class DetectTaskRequestDto {
  @IsString() boardId!: string;

  @IsString()
  @IsNotEmpty()
  content!: string; // nội dung tin nhắn cần phân tích

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetectTaskMemberDto)
  members!: DetectTaskMemberDto[];
}

// Card gợi ý AI trích ra.
export interface TaskSuggestion {
  title: string;
  description?: string;
  assigneeId?: string; // đã map về userId, null nếu không rõ
  dueDate?: string; // 'YYYY-MM-DD'
}

// BE -> FE
export interface DetectTaskResponse {
  isTask: boolean;
  confidence: number; // 0..1
  suggestion: TaskSuggestion | null;
}
