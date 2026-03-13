import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SupabaseService } from '../common/supabase/supabase.service';
import { StorageR2Service } from '../common/storage_r2/storage_r2.service';

@Injectable()
export class ApiInstaService {
  constructor(
    @InjectQueue('upload-queue') private readonly uploadQueue: Queue,
    private readonly supabaseService: SupabaseService,
    private readonly storageR2Service: StorageR2Service,
  ) { }

  async prepareUpload(postData: any, fileInfo: { fileName: string; mimetype: string }) {
    const { media_type, processing_status, related_links, ...cleanPostData } = postData;

    try {
      if (!cleanPostData.tags) {
        cleanPostData.tags = [];
      } else if (typeof cleanPostData.tags === 'string') {
        try {
          cleanPostData.tags = JSON.parse(cleanPostData.tags);
        } catch {
          cleanPostData.tags = [cleanPostData.tags];
        }
      }
    } catch (error) {
      cleanPostData.tags = [];
    }

    const draft = await this.supabaseService.createDraft(cleanPostData);

    let uploadUrl: string | null = null;
    let publicUrl: string | null =null;

    if (fileInfo.mimetype.startsWith('video/')) {
      // Vídeo → gera presigned URL do R2
      const uniqueFileName = `${draft.id}-${fileInfo.fileName}`;
      const result = await this.storageR2Service.getPresignedUrl(uniqueFileName, fileInfo.mimetype);
      uploadUrl = result.uploadUrl;
      publicUrl = result.publicUrl;
    } else {
      // Imagem → sem R2, a URL virá do Supabase após o upload no front-end
      uploadUrl = null;
      publicUrl = null;
    }

    return {
      status: 'success',
      uploadUrl,   // null para imagens
      publicUrl,   // null para imagens — front-end preenche depois
      postId: draft.id,
      slug: draft.slug,
      caption: cleanPostData.caption ?? null,
    };
  }
  async finalizePostAfterUpload(postId: string, mediaUrl: string, caption?: string, mimetype?: string) { // ✅ recebe caption
    await this.uploadQueue.add('process-video', {
      postId,
      mediaUrl,
      caption, // ✅ passa para o worker
    }, {
      attempts: 3,
      backoff: 2500,
      removeOnComplete: true,
      removeOnFail: true,
    });

    return { success: true, message: 'Processamento iniciado na fila.' };
  }
}