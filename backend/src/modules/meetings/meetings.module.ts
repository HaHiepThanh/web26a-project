import { Module } from '@nestjs/common';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { IcsParserService } from './ics-parser.service';

@Module({
  controllers: [MeetingsController],
  providers: [MeetingsService, IcsParserService],
})
export class MeetingsModule {}
