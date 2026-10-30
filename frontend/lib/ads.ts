// Rótulos e tons dos status e objetivos de anúncios (Marketing API).

export type Tone = 'good' | 'neutral' | 'warn' | 'bad'

const STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Ativo', tone: 'good' },
  PAUSED: { label: 'Pausado', tone: 'neutral' },
  CAMPAIGN_PAUSED: { label: 'Campanha pausada', tone: 'neutral' },
  ADSET_PAUSED: { label: 'Conjunto pausado', tone: 'neutral' },
  IN_PROCESS: { label: 'Em processamento', tone: 'warn' },
  PENDING_REVIEW: { label: 'Em análise', tone: 'warn' },
  PREAPPROVED: { label: 'Pré-aprovado', tone: 'warn' },
  WITH_ISSUES: { label: 'Com problema', tone: 'bad' },
  DISAPPROVED: { label: 'Reprovado', tone: 'bad' },
  PENDING_BILLING_INFO: { label: 'Pagamento pendente', tone: 'bad' },
  ARCHIVED: { label: 'Arquivado', tone: 'neutral' },
  DELETED: { label: 'Excluído', tone: 'neutral' },
}

export const adStatus = (s: string) => STATUS[s] ?? { label: s.toLowerCase().replace(/_/g, ' '), tone: 'warn' as Tone }

const OBJECTIVE: Record<string, string> = {
  OUTCOME_LEADS: 'Leads',
  OUTCOME_TRAFFIC: 'Tráfego',
  OUTCOME_ENGAGEMENT: 'Engajamento',
  OUTCOME_AWARENESS: 'Reconhecimento',
  OUTCOME_SALES: 'Vendas',
  OUTCOME_APP_PROMOTION: 'Promoção de app',
}
export const adObjective = (o: string) => OBJECTIVE[o] ?? o

/** Status que estão (ou vão estar) gastando. */
export const SPENDING = new Set(['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED'])

export const ACCOUNT_STATUS_TONE = (s?: string): Tone =>
  !s ? 'neutral' : s === 'ATIVA' ? 'good' : s === 'DESATIVADA' || s === 'ENCERRADA' || s === 'PAGAMENTO_PENDENTE' ? 'bad' : 'warn'
