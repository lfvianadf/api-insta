import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  public client: SupabaseClient;

  constructor(private configService: ConfigService) {
    this.client = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_KEY')!
    );
  }

  /**
   * PASSO 1: Criação do Rascunho com os dados do Frontend
   * Recebe: title, slug, content, excerpt, tags, author_id, category e views_count
   */
  async createDraft(postData: any) {
    const { data, error } = await this.client
      .from('posts')
      .insert([{ 
        ...postData, 
        is_published: false,    // Forçamos como rascunho inicialmente
        cover_image_url: null   // Ainda não temos a imagem/vídeo do R2
      }])
      .select()
      .single();

    if (error) {
      console.error('Erro ao inserir no Supabase:', error.message);
      throw error;
    }
    return data;
  }

  /**
   * PASSO 2: Finalização pelo Worker
   * Atualiza a coluna 'cover_image_url' e publica o post
   */
  async finalizePost(postId: string, r2Url: string) {
    const { data, error } = await this.client
      .from('posts')
      .update({ 
        cover_image_url: r2Url, // O link do seu domínio media.blogdosantana.com.br
        is_published: true      // Agora o post aparece no blog!
      })
      .eq('id', postId)
      .select();

    if (error) {
      console.error('Erro ao atualizar imagem no Supabase:', error.message);
      throw error;
    }
    return data;
  }
}