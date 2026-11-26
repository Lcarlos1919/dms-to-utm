// Mensagens de erro para o usuário. O código técnico e o detalhe ficam no diagnóstico (admin), não aqui.
const MENSAGENS: Record<string, string> = {
  PDF_INVALIDO: "Não consegui abrir este PDF. Envie o arquivo original, sem senha.",
  PDF_MUITO_GRANDE: "Este PDF é grande demais para processar. Envie um arquivo menor.",
  PDF_SEM_TEXTO: "Não encontrei texto neste PDF. Se for uma imagem digitalizada, tente de novo em instantes ou fale com o suporte.",
  NENHUM_VERTICE: "Não encontrei as coordenadas do perímetro neste memorial. Confira se o arquivo é o memorial descritivo completo.",
  PROJETO_NAO_ENCONTRADO: "Projeto não encontrado.",
  NAO_ENCONTRADO: "Projeto não encontrado.",
  PROJETO_EM_PROCESSAMENTO: "Este memorial já está sendo processado. Aguarde um pouco e atualize a página.",
  FEATURE_BLOQUEADA: "Este tipo de memorial não está disponível no seu plano.",
  PDF_NAO_ENCONTRADO: "O arquivo deste memorial não foi encontrado. Envie o PDF novamente.",
  ARQUIVOS_AUSENTES: "O arquivo deste memorial não foi encontrado. Envie o PDF novamente.",
  ERRO_BANCO: "Não foi possível acessar seus dados agora. Tente novamente em instantes.",
  ERRO_LEITURA: "Não foi possível ler os documentos. Tente novamente.",
  VERTEX_PERSISTENCE_FAILED: "Não foi possível salvar o resultado. Tente novamente.",
  PROJECT_UPDATE_FAILED: "Não foi possível salvar o resultado. Tente novamente.",
  USAGE_UPDATE_FAILED: "Não foi possível registrar o uso do plano. Tente novamente.",
  PERMISSAO_NEGADA: "A criação de memoriais está bloqueada para esta conta. Fale com o suporte.",
}

const GENERICA = "Não foi possível processar este memorial. Tente novamente; se o problema continuar, fale com o suporte."

/** Texto seguro para mostrar ao usuário a partir de um código de erro. */
export function mensagemParaUsuario(codigo: string | null | undefined): string {
  if (!codigo) return GENERICA
  if (codigo === "LIMITE_PLANO" || codigo === "COTA_EXCEDIDA") return "Você atingiu o limite do plano Grátis. Assine o Pro para continuar."
  return MENSAGENS[codigo] ?? GENERICA
}
