import { BadRequestException, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { FilesService } from './files.service';

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a file to object storage (10 MB max)' })
  async upload(@CurrentUser() user: AuthUser, @Req() req: FastifyRequest) {
    const part = await req.file();
    if (!part) throw new BadRequestException('Send the file as multipart field "file"');
    const buffer = await part.toBuffer();
    return this.files.upload(user.tenantId, user.userId, {
      originalname: part.filename,
      mimetype: part.mimetype,
      buffer,
    });
  }

  @Get('download-url')
  @ApiOperation({ summary: 'Presigned download URL for a stored file (15 min validity)' })
  downloadUrl(@CurrentUser() user: AuthUser, @Query('key') key: string) {
    return this.files.downloadUrl(user.tenantId, key);
  }
}
