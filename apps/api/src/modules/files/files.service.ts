import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface UploadInput {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.bucket = config.get<string>('S3_BUCKET_NAME') ?? 'peoplehub-files';
    this.s3 = new S3Client({
      endpoint: config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000',
      region: config.get<string>('S3_REGION') ?? 'ap-south-1',
      credentials: {
        accessKeyId: config.get<string>('S3_ACCESS_KEY_ID') ?? 'minio_access_key',
        secretAccessKey: config.get<string>('S3_SECRET_ACCESS_KEY') ?? 'minio_secret_key',
      },
      // MinIO (and most S3-compatible stores) need path-style addressing
      forcePathStyle: true,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created bucket ${this.bucket}`);
      } catch (err) {
        this.logger.warn(`Could not ensure bucket ${this.bucket}: ${(err as Error).message}`);
      }
    }
  }

  async upload(
    tenantId: string,
    uploadedById: string,
    file: UploadInput,
  ): Promise<{ id: string; key: string; name: string; sizeBytes: number }> {
    if (!file?.buffer?.length) throw new BadRequestException('No file received');
    if (file.buffer.length > MAX_FILE_BYTES) {
      throw new BadRequestException('File exceeds the 10 MB limit');
    }
    const safeName = file.originalname.replace(/[^\w.-]+/g, '_').slice(-100);
    const key = `${tenantId}/${randomUUID()}-${safeName}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );
    const record = await this.prisma.fileObject.create({
      data: {
        tenantId,
        key,
        name: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.buffer.length,
        bucket: this.bucket,
        uploadedById,
      },
    });
    return { id: record.id, key, name: record.name, sizeBytes: file.buffer.length };
  }

  /** Short-lived presigned download URL for a tenant-owned file. */
  async downloadUrl(tenantId: string, key: string): Promise<{ url: string; name: string }> {
    const record = await this.prisma.fileObject.findFirst({ where: { key, tenantId } });
    if (!record) throw new NotFoundException('File not found');
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: record.bucket,
        Key: record.key,
        ResponseContentDisposition: `attachment; filename="${record.name.replace(/"/g, '')}"`,
      }),
      { expiresIn: 900 },
    );
    return { url, name: record.name };
  }
}
