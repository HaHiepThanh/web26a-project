import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

@Module({
  controllers: [MeetingsController],
  providers: [MeetingsService],
})
export class MeetingsModule {}
