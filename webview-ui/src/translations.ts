export type LangKey = 'en' | 'ru' | 'de' | 'fr' | 'es' | 'pt' | 'zh' | 'ja';

export interface Translations {
  title: string;
  btnBack: string;
  btnSettings: string;
  urlLabel: string;
  urlPlaceholder: string;
  btnLoad: string;
  orDivider: string;
  idsLabel: string;
  pathLabel: string;
  iidLabel: string;
  cardTitle: string;
  cardSubtitle: string;
  btnGenerate: string;
  btnPrev: string;
  btnNext: string;
  filesChanged: (n: number) => string;
  stepLabel: (n: number, total: number) => string;
  jumpPrefix: string;
  secOverview: string;
  secExplanation: string;
  secChanges: (n: number) => string;
  secRemarks: string;
  remarksEmpty: string;
  noDiff: string;
  btnInline: string;
  btnSplit: string;
  linkGitlab: string;
  linkOpenMr: string;
  loadingDefault: string;
}

export const TR: Record<LangKey, Translations> = {
  en: {
    title: '🔍 AI MR Reviewer',
    btnBack: '← New MR', btnSettings: '⚙ Settings',
    urlLabel: 'MR URL', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
    btnLoad: 'Load', orDivider: 'or',
    idsLabel: 'Project & MR ID', pathLabel: 'Project path', iidLabel: 'MR IID',
    cardTitle: 'Review a Merge Request',
    cardSubtitle: 'Paste a GitLab MR URL or enter project details manually.',
    btnGenerate: '✨ Generate AI Review',
    btnPrev: '← Prev', btnNext: 'Next →',
    filesChanged: (n) => `${n} file(s) changed`,
    stepLabel: (n, total) => `${n} / ${total}`,
    jumpPrefix: 'Step',
    secOverview: '📊 MR Overview',
    secExplanation: '📋 Explanation',
    secChanges: (n) => `📄 Changes (${n} file${n > 1 ? 's' : ''})`,
    secRemarks: '⚠️ Remarks & Improvements',
    remarksEmpty: 'No remarks.',
    noDiff: 'No diff content',
    btnInline: 'Inline', btnSplit: 'Split',
    linkGitlab: '↗ GitLab', linkOpenMr: '🔗 Open in GitLab',
    loadingDefault: 'Loading...',
  },
  ru: {
    title: '🔍 AI MR Ревьюер',
    btnBack: '← Новый MR', btnSettings: '⚙ Настройки',
    urlLabel: 'URL Merge Request', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
    btnLoad: 'Загрузить', orDivider: 'или',
    idsLabel: 'Проект и ID', pathLabel: 'Путь к проекту', iidLabel: 'MR IID',
    cardTitle: 'Ревью Merge Request',
    cardSubtitle: 'Вставьте URL MR или укажите проект и номер вручную.',
    btnGenerate: '✨ Создать AI-ревью',
    btnPrev: '← Назад', btnNext: 'Далее →',
    filesChanged: (n) => `Изменено файлов: ${n}`,
    stepLabel: (n, total) => `${n} / ${total}`,
    jumpPrefix: 'Шаг',
    secOverview: '📊 Обзор MR',
    secExplanation: '📋 Объяснение',
    secChanges: (n) => `📄 Изменения (${n} файл${n === 1 ? '' : n < 5 ? 'а' : 'ов'})`,
    secRemarks: '⚠️ Замечания и улучшения',
    remarksEmpty: 'Замечаний нет.',
    noDiff: 'Нет содержимого diff',
    btnInline: 'Строчно', btnSplit: 'Разделить',
    linkGitlab: '↗ GitLab', linkOpenMr: '🔗 Открыть в GitLab',
    loadingDefault: 'Загрузка...',
  },
  de: {
    title: '🔍 AI MR Reviewer',
    btnBack: '← Neuer MR', btnSettings: '⚙ Einstellungen',
    urlLabel: 'MR-URL', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
    btnLoad: 'Laden', orDivider: 'oder',
    idsLabel: 'Projekt & MR-ID', pathLabel: 'Projektpfad', iidLabel: 'MR IID',
    cardTitle: 'Merge Request prüfen',
    cardSubtitle: 'Fügen Sie eine GitLab-MR-URL ein oder geben Sie die Projektdaten manuell ein.',
    btnGenerate: '✨ AI-Review erstellen',
    btnPrev: '← Zurück', btnNext: 'Weiter →',
    filesChanged: (n) => `${n} Datei(en) geändert`,
    stepLabel: (n, total) => `${n} / ${total}`,
    jumpPrefix: 'Schritt',
    secOverview: '📊 MR-Übersicht',
    secExplanation: '📋 Erklärung',
    secChanges: (n) => `📄 Änderungen (${n} Datei${n > 1 ? 'en' : ''})`,
    secRemarks: '⚠️ Anmerkungen & Verbesserungen',
    remarksEmpty: 'Keine Anmerkungen.',
    noDiff: 'Kein Diff-Inhalt',
    btnInline: 'Inline', btnSplit: 'Geteilt',
    linkGitlab: '↗ GitLab', linkOpenMr: '🔗 In GitLab öffnen',
    loadingDefault: 'Wird geladen...',
  },
  fr: {
    title: '🔍 Revue MR IA',
    btnBack: '← Nouveau MR', btnSettings: '⚙ Paramètres',
    urlLabel: 'URL de la MR', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
    btnLoad: 'Charger', orDivider: 'ou',
    idsLabel: 'Projet & ID MR', pathLabel: 'Chemin du projet', iidLabel: 'MR IID',
    cardTitle: 'Réviser une Merge Request',
    cardSubtitle: "Collez l'URL de la MR ou entrez le projet manuellement.",
    btnGenerate: '✨ Générer la revue IA',
    btnPrev: '← Précédent', btnNext: 'Suivant →',
    filesChanged: (n) => `${n} fichier(s) modifié(s)`,
    stepLabel: (n, total) => `${n} / ${total}`,
    jumpPrefix: 'Étape',
    secOverview: '📊 Vue ensemble MR',
    secExplanation: '📋 Explication',
    secChanges: (n) => `📄 Modifications (${n} fichier${n > 1 ? 's' : ''})`,
    secRemarks: '⚠️ Remarques & Améliorations',
    remarksEmpty: 'Aucune remarque.',
    noDiff: 'Aucun contenu diff',
    btnInline: 'Intégré', btnSplit: 'Divisé',
    linkGitlab: '↗ GitLab', linkOpenMr: '🔗 Ouvrir dans GitLab',
    loadingDefault: 'Chargement...',
  },
  es: {
    title: '🔍 Revisor MR IA',
    btnBack: '← Nuevo MR', btnSettings: '⚙ Ajustes',
    urlLabel: 'URL de la MR', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
    btnLoad: 'Cargar', orDivider: 'o',
    idsLabel: 'Proyecto e ID MR', pathLabel: 'Ruta del proyecto', iidLabel: 'MR IID',
    cardTitle: 'Revisar Merge Request',
    cardSubtitle: 'Pegue la URL de la MR o ingrese el proyecto manualmente.',
    btnGenerate: '✨ Generar revisión IA',
    btnPrev: '← Anterior', btnNext: 'Siguiente →',
    filesChanged: (n) => `${n} archivo(s) cambiado(s)`,
    stepLabel: (n, total) => `${n} / ${total}`,
    jumpPrefix: 'Paso',
    secOverview: '📊 Resumen del MR',
    secExplanation: '📋 Explicación',
    secChanges: (n) => `📄 Cambios (${n} archivo${n > 1 ? 's' : ''})`,
    secRemarks: '⚠️ Observaciones y Mejoras',
    remarksEmpty: 'Sin observaciones.',
    noDiff: 'Sin contenido diff',
    btnInline: 'En línea', btnSplit: 'Dividido',
    linkGitlab: '↗ GitLab', linkOpenMr: '🔗 Abrir en GitLab',
    loadingDefault: 'Cargando...',
  },
  pt: {
    title: '🔍 Revisor MR IA',
    btnBack: '← Novo MR', btnSettings: '⚙ Configurações',
    urlLabel: 'URL da MR', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
    btnLoad: 'Carregar', orDivider: 'ou',
    idsLabel: 'Projeto & ID MR', pathLabel: 'Caminho do projeto', iidLabel: 'MR IID',
    cardTitle: 'Revisar Merge Request',
    cardSubtitle: 'Cole a URL da MR ou insira o projeto manualmente.',
    btnGenerate: '✨ Gerar revisão IA',
    btnPrev: '← Anterior', btnNext: 'Próximo →',
    filesChanged: (n) => `${n} arquivo(s) alterado(s)`,
    stepLabel: (n, total) => `${n} / ${total}`,
    jumpPrefix: 'Passo',
    secOverview: '📊 Visão Geral do MR',
    secExplanation: '📋 Explicação',
    secChanges: (n) => `📄 Alterações (${n} arquivo${n > 1 ? 's' : ''})`,
    secRemarks: '⚠️ Observações & Melhorias',
    remarksEmpty: 'Sem observações.',
    noDiff: 'Sem conteúdo diff',
    btnInline: 'Em linha', btnSplit: 'Dividido',
    linkGitlab: '↗ GitLab', linkOpenMr: '🔗 Abrir no GitLab',
    loadingDefault: 'Carregando...',
  },
  zh: {
    title: '🔍 AI MR 审查工具',
    btnBack: '← 新的 MR', btnSettings: '⚙ 设置',
    urlLabel: 'MR 链接', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
    btnLoad: '加载', orDivider: '或',
    idsLabel: '项目和 MR ID', pathLabel: '项目路径', iidLabel: 'MR IID',
    cardTitle: '审查 Merge Request',
    cardSubtitle: '粘贴 GitLab MR 链接，或手动输入项目信息。',
    btnGenerate: '✨ 生成 AI 审查',
    btnPrev: '← 上一步', btnNext: '下一步 →',
    filesChanged: (n) => `已更改 ${n} 个文件`,
    stepLabel: (n, total) => `${n} / ${total}`,
    jumpPrefix: '步骤',
    secOverview: '📊 MR 总览',
    secExplanation: '📋 说明',
    secChanges: (n) => `📄 更改（${n} 个文件）`,
    secRemarks: '⚠️ 备注与改进建议',
    remarksEmpty: '无备注。',
    noDiff: '无 diff 内容',
    btnInline: '内联', btnSplit: '分屏',
    linkGitlab: '↗ GitLab', linkOpenMr: '🔗 在 GitLab 中打开',
    loadingDefault: '加载中...',
  },
  ja: {
    title: '🔍 AI MR レビュアー',
    btnBack: '← 新しい MR', btnSettings: '⚙ 設定',
    urlLabel: 'MR URL', urlPlaceholder: 'https://gitlab.com/group/project/-/merge_requests/42',
    btnLoad: '読み込む', orDivider: 'または',
    idsLabel: 'プロジェクトと MR ID', pathLabel: 'プロジェクトパス', iidLabel: 'MR IID',
    cardTitle: 'Merge Request をレビューする',
    cardSubtitle: 'GitLab MR の URL を貼り付けるか、プロジェクト情報を手動で入力してください。',
    btnGenerate: '✨ AI レビューを生成',
    btnPrev: '← 前へ', btnNext: '次へ →',
    filesChanged: (n) => `${n} ファイルが変更されました`,
    stepLabel: (n, total) => `${n} / ${total}`,
    jumpPrefix: 'ステップ',
    secOverview: '📊 MR 概要',
    secExplanation: '📋 説明',
    secChanges: (n) => `📄 変更（${n} ファイル）`,
    secRemarks: '⚠️ 所見と改善提案',
    remarksEmpty: '所見なし。',
    noDiff: 'diff の内容なし',
    btnInline: 'インライン', btnSplit: '分割',
    linkGitlab: '↗ GitLab', linkOpenMr: '🔗 GitLab で開く',
    loadingDefault: '読み込み中...',
  },
};
