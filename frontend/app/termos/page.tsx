import styles from "./legal.module.css";

export const metadata = {
  title: "Termos de Uso — Código Zero",
  description: "Termos de Uso da plataforma Código Zero. Leia atentamente antes de usar nossos serviços.",
};

export default function TermosPage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>

        <a href="/" className={styles.backLink}>
          ← Voltar ao site
        </a>

        <h1 className={styles.title}>Termos de Uso</h1>
        <p className={styles.updated}>Última atualização: 25 de Abril de 2026</p>

        <div className={styles.content}>

          <h2>1. Aceitação dos Termos</h2>
          <p>Ao acessar e utilizar a plataforma <strong>Código Zero</strong> (&quot;Plataforma&quot;), você concorda integralmente com estes Termos de Uso. Caso não concorde com qualquer disposição, interrompa imediatamente o uso da Plataforma.</p>
          <p>A Plataforma é operada por <strong>Ângelo Geraldo Deixa</strong>, pessoa física, moçambicano residente no Brasil, que oferece conteúdo educativo, ferramentas de prospecção e automação para micronegócios de Inteligência Artificial.</p>

          <h2>2. Definições</h2>
          <ul>
            <li><strong>&quot;Usuário&quot;</strong> ou <strong>&quot;Membro&quot;</strong>: pessoa física que se cadastra e acessa a Plataforma mediante pagamento da assinatura.</li>
            <li><strong>&quot;Conteúdo&quot;</strong>: aulas em vídeo, scripts, templates, materiais de apoio e qualquer recurso disponibilizado na Plataforma.</li>
            <li><strong>&quot;Ferramentas&quot;</strong>: Scraper de Leads, Banco de Scripts, automações e quaisquer funcionalidades técnicas da Plataforma.</li>
            <li><strong>&quot;Assinatura&quot;</strong>: plano de acesso mensal mediante pagamento recorrente.</li>
          </ul>

          <h2>3. Cadastro e Acesso</h2>
          <p>Para utilizar a Plataforma, o Usuário deve:</p>
          <ol>
            <li>Fornecer dados pessoais verídicos e actualizados (nome, e-mail, telefone/WhatsApp).</li>
            <li>Manter a confidencialidade das credenciais de acesso (e-mail e senha).</li>
            <li>Ser maior de 18 anos ou possuir autorização legal do responsável.</li>
          </ol>
          <p>O Código Zero reserva-se o direito de suspender ou cancelar contas que contenham informações falsas, violem estes termos ou sejam utilizadas de forma fraudulenta.</p>

          <h2>4. Assinatura e Pagamento</h2>
          <p>O acesso à Plataforma requer o pagamento de uma assinatura mensal. A assinatura é renovada automaticamente a cada 30 dias.</p>
          <ul>
            <li>O pagamento é processado por meio de parceiros de pagamento autorizados (M-Pesa, cartão, etc.).</li>
            <li>Em caso de falha no pagamento, o acesso será mantido por um período de tolerância de até <strong>72 horas</strong>.</li>
            <li>Após o período de tolerância, o acesso será <strong>bloqueado automaticamente</strong> até a regularização do pagamento.</li>
            <li>A reactivação da conta após bloqueio por inadimplência requer novo pagamento.</li>
          </ul>

          <h2>5. Garantia Condicional de 30 Dias</h2>
          <div className={styles.highlight}>
            <p>A garantia de reembolso do Código Zero é <strong>condicional</strong>. Ela existe para proteger quem realmente se compromete com o processo — e não para quem apenas se inscreve e não faz nada.</p>
          </div>
          <p>Para solicitar o reembolso dentro do prazo de 30 dias após a compra, o Usuário deverá <strong>comprovar cumulativamente</strong> que:</p>
          <ol>
            <li><strong>Assistiu 100% das aulas</strong> de todos os módulos disponíveis na Plataforma, conforme registado pelo sistema de progresso interno.</li>
            <li><strong>Testou os scripts</strong> disponíveis no Banco de Scripts, enviando-os para pelo menos <strong>20 leads reais</strong> através do Scraper da Plataforma ou manualmente.</li>
            <li><strong>Participou de pelo menos 1 mentoria ao vivo</strong> ou assistiu à gravação da mentoria na íntegra.</li>
            <li><strong>Implementou na prática</strong> os conhecimentos adquiridos, demonstrando evidências de prospecção activa (capturas de tela de conversas, propostas enviadas, etc.).</li>
          </ol>
          <p>Se, após cumprir <strong>todos</strong> os requisitos acima, o Usuário não tiver obtido nenhum resultado comercial (zero contratos fechados), o Código Zero se compromete a:</p>
          <ul>
            <li>Devolver <strong>100% do valor pago</strong>.</li>
            <li>Oferecer <strong>1 hora de consultoria individual gratuita</strong> para análise e ajuste da estratégia do Usuário.</li>
          </ul>
          <p><strong>Pedidos de reembolso que não cumpram os requisitos acima serão negados.</strong> A mera inscrição na Plataforma sem utilização do conteúdo e ferramentas não dá direito a reembolso.</p>
          <p>O pedido de reembolso deve ser feito por e-mail ou WhatsApp dentro de <strong>30 dias corridos</strong> após a data do primeiro pagamento.</p>

          <h2>6. Propriedade Intelectual</h2>
          <p>Todo o conteúdo disponibilizado na Plataforma (vídeos, textos, scripts, código-fonte, design, marca, logótipos) é de propriedade exclusiva do Código Zero e está protegido pela legislação de direitos autorais.</p>
          <p>O Usuário <strong>não pode</strong>:</p>
          <ul>
            <li>Copiar, reproduzir, distribuir ou revender o Conteúdo da Plataforma a terceiros.</li>
            <li>Gravar, fazer download ou capturar em tela as aulas e materiais para uso fora da Plataforma.</li>
            <li>Compartilhar credenciais de acesso com outras pessoas.</li>
            <li>Utilizar o Conteúdo para criar produtos ou serviços concorrentes.</li>
          </ul>
          <p>A violação desta cláusula resultará no cancelamento imediato da conta, <strong>sem direito a reembolso</strong>, além de medidas judiciais cabíveis.</p>

          <h2>7. Uso das Ferramentas</h2>
          <p>O Scraper de Leads e demais ferramentas de prospecção são disponibilizados exclusivamente para fins comerciais lícitos. O Usuário se compromete a:</p>
          <ul>
            <li>Utilizar os dados extraídos de forma ética e em conformidade com a legislação local.</li>
            <li>Não utilizar as ferramentas para spam, assédio ou qualquer actividade ilegal.</li>
            <li>Respeitar os limites de uso diário estabelecidos pela Plataforma.</li>
          </ul>
          <p>O Código Zero não se responsabiliza pelo uso indevido das ferramentas pelo Usuário.</p>

          <h2>8. Limitação de Responsabilidade</h2>
          <p>A Plataforma fornece ferramentas e conhecimento, mas <strong>não garante resultados financeiros específicos</strong>. O sucesso do Usuário depende exclusivamente da sua dedicação, execução e condições de mercado.</p>
          <p>O Código Zero não será responsável por:</p>
          <ul>
            <li>Prejuízos decorrentes de decisões comerciais do Usuário.</li>
            <li>Indisponibilidade temporária da Plataforma por motivos técnicos ou de manutenção.</li>
            <li>Dados desactualizados obtidos pelo Scraper de Leads, visto que depende de fontes externas.</li>
          </ul>

          <h2>9. Cancelamento</h2>
          <p>O Usuário pode cancelar sua assinatura a qualquer momento. O cancelamento:</p>
          <ul>
            <li>Mantém o acesso até o fim do período já pago.</li>
            <li>Não gera direito a reembolso proporcional dos dias restantes.</li>
            <li>Remove o acesso a todas as ferramentas e conteúdo após o término do período.</li>
          </ul>
          <p>O Código Zero reserva-se o direito de cancelar a conta de qualquer Usuário que viole estes Termos, sem aviso prévio e sem direito a reembolso.</p>

          <h2>10. Modificações dos Termos</h2>
          <p>O Código Zero pode alterar estes Termos de Uso a qualquer momento. As alterações serão comunicadas por e-mail ou dentro da Plataforma. O uso continuado após a notificação constitui aceitação dos novos termos.</p>

          <h2>11. Legislação Aplicável</h2>
          <p>Estes Termos de Uso são regidos pela legislação da República Federativa do Brasil, em especial o Código de Defesa do Consumidor (Lei nº 8.078/1990) e a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD). Qualquer litígio será resolvido no foro do domicílio do consumidor, conforme previsto no art. 101, I do CDC.</p>

          <h2>12. Contacto</h2>
          <p>Para questões relacionadas a estes Termos de Uso, entre em contacto:</p>
          <ul>
            <li><strong>E-mail:</strong> eusouheranca@gmail.com</li>
            <li><strong>WhatsApp:</strong> +1 (620) 526-0031</li>
            <li><strong>Instagram:</strong> <a href="https://www.instagram.com/ocodigozero_/" target="_blank" rel="noopener noreferrer" style={{color: 'var(--accent)'}}>@ocodigozero_</a></li>
          </ul>

        </div>
      </div>
    </div>
  );
}
