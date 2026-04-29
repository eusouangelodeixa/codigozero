import styles from "./legal.module.css";

export const metadata = {
  title: "Política de Privacidade — Código Zero",
  description: "Política de Privacidade da plataforma Código Zero. Saiba como seus dados são tratados.",
};

export default function PrivacidadePage() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>

        <a href="/" className={styles.backLink}>
          ← Voltar ao site
        </a>

        <h1 className={styles.title}>Política de Privacidade</h1>
        <p className={styles.updated}>Última atualização: 25 de Abril de 2026</p>

        <div className={styles.content}>

          <h2>1. Introdução</h2>
          <p>A <strong>Código Zero</strong>, operada por <strong>Ângelo Geraldo Deixa</strong>, pessoa física, moçambicano residente no Brasil, (&quot;nós&quot;, &quot;nosso&quot;) está comprometida com a proteção da privacidade dos seus dados pessoais. Esta Política de Privacidade descreve como recolhemos, utilizamos, armazenamos e protegemos as informações dos nossos utilizadores (&quot;você&quot;), em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).</p>
          <p>Ao utilizar a nossa plataforma, você consente com as práticas descritas nesta política.</p>

          <h2>2. Dados que Recolhemos</h2>
          <p>Recolhemos os seguintes tipos de dados:</p>

          <p><strong>2.1. Dados fornecidos por você:</strong></p>
          <ul>
            <li>Nome completo</li>
            <li>Endereço de e-mail</li>
            <li>Número de telefone/WhatsApp</li>
            <li>Respostas ao questionário de diagnóstico</li>
            <li>Dados de pagamento (processados pelos nossos parceiros de pagamento — não armazenamos dados de cartão)</li>
          </ul>

          <p><strong>2.2. Dados recolhidos automaticamente:</strong></p>
          <ul>
            <li>Endereço IP</li>
            <li>Tipo de navegador e dispositivo</li>
            <li>Páginas visitadas e tempo de permanência</li>
            <li>Progresso nas aulas e utilização das ferramentas</li>
            <li>Cookies e tecnologias similares</li>
          </ul>

          <h2>3. Como Utilizamos os Seus Dados</h2>
          <p>Os seus dados são utilizados para:</p>
          <ul>
            <li><strong>Prestação do serviço:</strong> criar e gerir a sua conta, fornecer acesso ao conteúdo e ferramentas.</li>
            <li><strong>Comunicação:</strong> enviar credenciais de acesso, notificações de pagamento, atualizações da plataforma e lembretes de mentoria.</li>
            <li><strong>Remarketing:</strong> caso abandone o processo de compra, podemos enviar mensagens de acompanhamento via WhatsApp para oferecer suporte.</li>
            <li><strong>Melhoria do serviço:</strong> analisar padrões de uso para aprimorar a experiência do utilizador.</li>
            <li><strong>Suporte:</strong> responder a dúvidas e resolver problemas técnicos.</li>
            <li><strong>Obrigações legais:</strong> cumprir requisitos legais e regulatórios aplicáveis.</li>
          </ul>

          <h2>4. Comunicações via WhatsApp</h2>
          <div className={styles.highlight}>
            <p>Ao fornecer o seu número de WhatsApp, você consente expressamente em receber mensagens relacionadas ao serviço, incluindo credenciais de acesso, lembretes de pagamento e conteúdo de suporte.</p>
          </div>
          <p>Você pode solicitar a interrupção das comunicações de marketing a qualquer momento, sem prejuízo do acesso aos serviços contratados. Mensagens transacionais (credenciais, confirmações de pagamento) continuarão a ser enviadas enquanto a sua conta estiver activa.</p>

          <h2>5. Partilha de Dados</h2>
          <p><strong>Não vendemos</strong> os seus dados pessoais a terceiros. Os seus dados podem ser partilhados apenas com:</p>
          <ul>
            <li><strong>Processadores de pagamento:</strong> para processar transações financeiras.</li>
            <li><strong>Prestadores de serviço:</strong> ferramentas de e-mail, hospedagem e comunicação (sob contratos de confidencialidade).</li>
            <li><strong>Autoridades legais:</strong> quando exigido por lei ou ordem judicial.</li>
          </ul>

          <h2>6. Armazenamento e Segurança</h2>
          <p>Os seus dados são armazenados em servidores seguros com as seguintes medidas de proteção:</p>
          <ul>
            <li>Encriptação de dados em trânsito (HTTPS/TLS).</li>
            <li>Senhas armazenadas com hash criptográfico (bcrypt).</li>
            <li>Acesso restrito a dados pessoais (apenas pessoal autorizado).</li>
            <li>Backups regulares para prevenção de perda de dados.</li>
          </ul>
          <p>Apesar dos nossos esforços, nenhum sistema é 100% seguro. Em caso de violação de dados, notificaremos os utilizadores afectados dentro de 72 horas.</p>

          <h2>7. Cookies</h2>
          <p>Utilizamos cookies e tecnologias similares para:</p>
          <ul>
            <li>Manter a sua sessão de login activa.</li>
            <li>Guardar preferências do utilizador.</li>
            <li>Analisar o tráfego e utilização da plataforma.</li>
          </ul>
          <p>Pode desactivar os cookies nas configurações do seu navegador, mas isso poderá afectar o funcionamento da Plataforma.</p>

          <h2>8. Retenção de Dados</h2>
          <p>Mantemos os seus dados pessoais enquanto a sua conta estiver activa ou conforme necessário para:</p>
          <ul>
            <li>Cumprir obrigações legais.</li>
            <li>Resolver disputas.</li>
            <li>Fazer cumprir os nossos Termos de Uso.</li>
          </ul>
          <p>Após o cancelamento da conta, os dados serão mantidos por um período máximo de <strong>12 meses</strong> para fins de auditoria e compliance, após o qual serão permanentemente eliminados.</p>

          <h2>9. Os Seus Direitos</h2>
          <p>Você tem o direito de:</p>
          <ul>
            <li><strong>Acesso:</strong> solicitar uma cópia dos seus dados pessoais.</li>
            <li><strong>Rectificação:</strong> corrigir dados incorretos ou desactualizados.</li>
            <li><strong>Eliminação:</strong> solicitar a exclusão dos seus dados (sujeito a obrigações legais de retenção).</li>
            <li><strong>Portabilidade:</strong> receber os seus dados em formato legível por máquina.</li>
            <li><strong>Oposição:</strong> recusar o tratamento dos seus dados para fins de marketing.</li>
          </ul>
          <p>Para exercer qualquer desses direitos, entre em contacto connosco.</p>

          <h2>10. Menores de Idade</h2>
          <p>A Plataforma não é destinada a menores de 18 anos. Não recolhemos intencionalmente dados de menores. Se tomarmos conhecimento de que recolhemos dados de um menor, eliminaremos essa informação imediatamente.</p>

          <h2>11. Alterações a Esta Política</h2>
          <p>Podemos actualizar esta Política de Privacidade periodicamente. Quaisquer alterações significativas serão comunicadas por e-mail ou notificação na Plataforma. O uso continuado após a notificação constitui aceitação das alterações.</p>

          <h2>12. Contacto</h2>
          <p>Para questões relacionadas à privacidade dos seus dados, entre em contacto:</p>
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
