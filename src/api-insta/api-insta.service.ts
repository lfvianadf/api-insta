import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SupabaseService } from '../common/supabase/supabase.service';
// Importação necessária para gerar as URLs no R2
import { StorageR2Service } from '../common/storage_r2/storage_r2.service'; 

@Injectable()
export class ApiInstaService {
  constructor(
    @InjectQueue('upload-queue') private readonly uploadQueue: Queue,
    private readonly supabaseService: SupabaseService,
    // Injetamos o serviço de R2 para gerar os links
    private readonly storageR2Service: StorageR2Service, 
  ) {}

  /**
   * NOVA ABORDAGEM: Prepara o terreno para o upload de 100MB+
   * O vídeo não passa mais por aqui como Buffer.
   */
  async prepareUpload(postData: any, fileInfo: { fileName: string; mimetype: string }) {
    // 1. Criamos o rascunho no Supabase primeiro (Controle)
    const { related_links, ...cleanPostData } = postData;
    cleanPostData.tags = JSON.parse(cleanPostData.tags || '[]');
    const draft = await this.supabaseService.createDraft(cleanPostData);

    // 2. Geramos as URLs de Upload e a Permanente no R2
    // Usamos o ID do post no nome do arquivo para evitar conflitos
    const uniqueFileName = `${draft.id}-${fileInfo.fileName}`;
    const { uploadUrl, publicUrl } = await this.storageR2Service.getPresignedUrl(
      uniqueFileName,
      fileInfo.mimetype
    );

    // 3. Retornamos para o Frontend as instruções de onde subir o arquivo
    return {
      status: 'success',
      uploadUrl,     // URL temporária para o PUT do Front-end
      publicUrl,     // URL que ficará no Blog e Instagram
      postId: draft.id,
      slug: draft.slug
    };
  }

  /**
   * NOVO ENDPOINT DE FINALIZAÇÃO:
   * Chamado pelo Front-end após o upload para o R2 terminar com sucesso.
   */
  async finalizePostAfterUpload(postId: string, mediaUrl: string) {
    // Agora sim, colocamos na fila apenas o LINK (string), sem o Buffer pesado!
    await this.uploadQueue.add('process-video', {
      postId,
      mediaUrl, // Enviamos apenas a URL para o Worker
    }, {
      attempts: 3,
      backoff: 2500,
      removeOnComplete: true,
      removeOnFail: true // Garante limpeza total do Redis de 8GB
    });

    return { success: true, message: 'Processamento iniciado na fila.' };
  }
}