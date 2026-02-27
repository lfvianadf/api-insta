import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class StorageR2Service {
  private s3Client: S3Client;

  constructor(private configService: ConfigService) {
    // Buscamos os valores no env
    const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    // Se qualquer um for undefined, lançamos um erro claro no terminal
    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error('As credenciais do Cloudflare R2 não foram encontradas no .env');
    }

    // Inicialização do cliente S3 compatível com o R2 da Cloudflare
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
   * Método de Upload adaptado para Filas (BullMQ)
   * @param fileBuffer Dados brutos do arquivo (vindas do Redis)
   * @param originalName Nome original para sanitização
   * @param mimetype Tipo do arquivo (image/png, video/mp4, etc)
   */
  async uploadFile(
    fileBuffer: Buffer, 
    originalName: string, 
    mimetype: string, 
    folder: string = 'posts'
  ) {
    // 1. Sanitização: Transforma "Foto do Paulo!.jpg" em "foto-do-paulo-.jpg"
    // Isso evita quebra de URLs no domínio media.blogdosantana.com.br
    const sanitizedName = originalName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-zA-Z0-9.]/g, '-')  // Troca caracteres especiais por hífen
      .toLowerCase();

    // 2. Cria um caminho único usando timestamp para evitar arquivos duplicados
    const fileName = `${folder}/${Date.now()}-${sanitizedName}`;

    // 3. Envio para o bucket configurado no seu .env
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.configService.get<string>('R2_BUCKET_NAME'),
        Key: fileName,
        Body: fileBuffer,
        ContentType: mimetype,
      }),
    );

    // 4. Retorna a URL pública completa para ser salva no Supabase
    return `${this.configService.get<string>('R2_PUBLIC_URL')}/${fileName}`;
  }
}