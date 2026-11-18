# Mercado e monetização do Vertix

**Registrado em:** 2026-11-18
**Fonte:** pesquisa externa feita pelo usuário com um assistente de IA (Gemini). Os números abaixo são **estimativas não verificadas**; confirmar nas fontes citadas antes de usar em decisões.

Documentos relacionados: `ROADMAP.md` (Fase 7) e `ACTION-PLAN.md` (Etapas 5b e 5c).

---

## 1. Mercado endereçável em Rondônia (estimativa)

Total: **2.500 a 3.500 profissionais ativos**.

| Público | Tamanho estimado | Perfil |
| --- | --- | --- |
| Principal (dor alta, compra rápida) | 600–900 | Engenheiros agrimensores, técnicos em agrimensura (CFT) e credenciados no SIGEF atuando em RO. Lidam com memoriais e plantas todos os dias |
| Secundário (uso recorrente) | ~2.200 | Parte dos ~8.933 registrados no Crea-RO: ~1.708 agrônomos, 500+ florestais e civis de loteamento/infraestrutura. Precisam de DXF/KML para licenciamento ambiental, crédito rural e projetos |
| Complementar | 300–500 empresas | Escritórios de topografia, consultorias ambientais, advogados agraristas e cartórios de registro de imóveis |

Polos citados: Porto Velho, Ji-Paraná, Vilhena, Ariquemes, Cacoal e Rolim de Moura.
Demanda forte em regularização fundiária, desmembramentos, CAR e projetos agropecuários.

**Prospecção:** a lista pública de credenciados do SIGEF pode ser filtrada por RO.

Fontes indicadas: busca de profissionais do Crea-RO, entidades registradas no Crea-RO e o SIGEF/INCRA.

## 2. Uso dos dados públicos (SIGEF, Acervo Fundiário, GeoPortal)

- Parcelas certificadas do SIGEF e o acervo fundiário (Terra Legal/SIGLO) são dados públicos abertos (Lei de Acesso à Informação, nº 12.527/2011, e Política de Dados Abertos).
- **Pode:** cobrar pelo software, pela automação e pelo cruzamento de informações.
- **Não pode:** revender o dado bruto como se fosse próprio.
- Outras empresas de inteligência geográfica já oferecem consulta paga de sobreposição usando essas bases.

**Antes de lançar:** revisar as licenças de cada base e os termos de uso do Vertix (citar fontes e data da base).

## 3. Recursos que aumentam o valor do plano Pro

1. **Conferência automática de sobreposição.** Depois de gerar o polígono, avisar: "este polígono sobrepõe 2 parcelas já certificadas no SIGEF". É o recurso com mais potencial para justificar o Pro.
2. **Confrontantes em DXF.** Botão "baixar confrontantes do SIGEF num raio de 1 km", evitando baixar shapefile por shapefile no site do INCRA.

Hipótese de preço: **R$ 69,90 a R$ 99,90 por mês** no Pro. Validar com usuários antes de fixar.

## 4. Cuidado técnico

Os portais do governo (SIGEF, GeoPortal) são instáveis e podem bloquear requisições. O caminho certo:

1. Baixar periodicamente os shapefiles estaduais (Acervo Fundiário/INCRA ou WFS oficial).
2. Carregar no próprio Supabase com **PostGIS** (já instalado no projeto, versão 3.3.7).
3. Atualizar semanal ou quinzenalmente e mostrar a data da base ao usuário.

O Vertix já segue essa linha com a base SEDAM (`fundiario_lotes`, 114.256 lotes, base de 2026-10-29) e usa o GeoPortal ao vivo só como complemento.

## 5. Decisões em aberto

- Foco inicial: Rondônia com abordagem direta, ou anúncios para o Brasil?
- Preço e conteúdo do plano Pro.
- Quais bases além da SEDAM: parcelas certificadas do SIGEF, CAR, outras.
