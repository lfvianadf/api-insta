import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
// Importação crucial para a nova estratégia
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"; 

@Injectable()
export class StorageR2Service {
  private s3Client: S3Client;

  constructor(private configService: ConfigService) {
    const endpoint = process.env.R2_ENDPOINT;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('As credenciais do Cloudflare R2 não foram encontradas no .env');
    }

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: endpoint,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });
  }

  /**
   * NOVA ABORDAGEM: Gera uma URL para o Front-end fazer o upload direto (100MB+)
   * Isso evita que o arquivo passe pelo seu servidor no Railway.
   */
  async getPresignedUrl(originalName: string, mimetype: string, folder: string = 'posts') {
    // 1. Sanitização idêntica à que você já usava
    const sanitizedName = originalName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9.]/g, '-')
      .toLowerCase();

    const fileName = `${folder}/${Date.now()}-${sanitizedName}`;
    const bucketName = this.configService.get<string>('R2_BUCKET_NAME');

    // 2. Criamos o comando de "Put" (Escrita)
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      ContentType: mimetype,
    });

    // 3. Geramos a URL temporária (válida por 15 minutos)
    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });

    // 4. Construímos a URL pública definitiva para o Blog/Instagram
    const publicUrl = `${this.configService.get<string>('R2_PUBLIC_URL')}/${fileName}`;

    return { uploadUrl, publicUrl };
  }
}