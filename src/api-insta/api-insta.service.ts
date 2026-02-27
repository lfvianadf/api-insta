import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SupabaseService } from '../common/supabase/supabase.service';

@Injectable()
export class ApiInstaService {
  constructor(
    @InjectQueue('upload-queue') private readonly uploadQueue: Queue,
    private readonly supabaseService: SupabaseService,
  ) {}

  async handleNewPost(file: Express.Multer.File, postData: any) {
    // 1. Chamamos a função de INSERT que criamos (Etapa 1)
    // Ela usa o ...postData para espalhar os campos do seu CSV no banco
    const { related_links, ...cleanPostData } = postData;
  
    cleanPostData.tags = JSON.parse(cleanPostData.tags || '[]');
  
    const draft = await this.supabaseService.createDraft(cleanPostData);

    // 2. Colocamos o trabalho pesado na fila do BullMQ
    await this.uploadQueue.add('process-video', {
      postId: draft.id,       // ID do banco para o Worker saber quem atualizar
      fileBuffer: file.buffer, // O vídeo 
      fileName: file.originalname,
      mimetype: file.mimetype,
    }, {
      attempts: 3,             // Tenta 3 vezes se falhar
      backoff: 5000,           // Espera 5s entre tentativas
      removeOnComplete: true   // Não entope o Redis com tarefas finalizadas
    });

    // 3. Resposta Imediata para o Frontend
    return {
      status: 'success',
      message: 'Dados salvos! O vídeo está sendo processado em background.',
      postId: draft.id,
      slug: draft.slug
    };
  }
}