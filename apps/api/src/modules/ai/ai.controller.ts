import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { ChatDto } from './dto/ai.dto';
import { AiService } from './ai.service';

@ApiTags('AI Copilot')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Chat with PeopleHub Copilot' })
  chat(@CurrentUser() user: AuthUser, @Body() dto: ChatDto) {
    return this.ai.chat(user, dto.message, dto.conversationId);
  }

  @Get('history')
  history(@CurrentUser() user: AuthUser, @Query('conversationId') conversationId?: string) {
    return this.ai.history(user, conversationId);
  }

  @Get('suggestions')
  suggestions(@CurrentUser() user: AuthUser) {
    return this.ai.suggestions(user);
  }
}
