import { Module } from '@nestjs/common';
import { BoardPrefsController } from './board-prefs.controller';
import { BoardPrefsService } from './board-prefs.service';

@Module({
  controllers: [BoardPrefsController],
  providers: [BoardPrefsService],
})
export class BoardPrefsModule {}
