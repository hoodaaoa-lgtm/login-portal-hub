import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const LANGUAGES = [
  { code: "pt", label: "Português", flag: "🇵🇹", dir: "ltr" },
  { code: "en", label: "English",   flag: "🇬🇧", dir: "ltr" },
  { code: "fr", label: "Français",  flag: "🇫🇷", dir: "ltr" },
  { code: "es", label: "Español",   flag: "🇪🇸", dir: "ltr" },
  { code: "ar", label: "العربية",   flag: "🇸🇦", dir: "rtl" },
] as const;

export type LangCode = typeof LANGUAGES[number]["code"];

const resources = {
  "pt": {
    "common": {
      "nav": {
        "home": "Início",
        "explore": "Explorar",
        "tv": "HoodaTV",
        "messages": "Mensagens",
        "profile": "Perfil"
      },
      "auth": {
        "signin": "Entrar",
        "signup": "Criar conta",
        "signout": "Terminar sessão",
        "email": "Email",
        "password": "Palavra-passe",
        "confirm_password": "Confirmar palavra-passe",
        "forgot_password": "Esqueci a palavra-passe",
        "no_account": "Ainda não tens conta?",
        "have_account": "Já tens conta?",
        "loading": "A carregar..."
      },
      "profile": {
        "edit": "Editar perfil",
        "followers": "Seguidores",
        "following": "Seguindo",
        "publications": "Publicações",
        "follow": "Seguir",
        "unfollow": "Seguindo",
        "message": "Mensagem",
        "bio": "Biografia",
        "website": "Website",
        "location": "Localização",
        "member_since": "Membro desde",
        "username": "Nome de utilizador",
        "full_name": "Nome completo",
        "save": "Guardar",
        "cancel": "Cancelar",
        "username_available": "Disponível!",
        "username_taken": "Este nome de utilizador já está em uso.",
        "username_invalid": "Mínimo 3 caracteres. Apenas letras, números, . e _"
      },
      "post": {
        "create": "Criar publicação",
        "publish": "Publicar",
        "publishing": "A publicar...",
        "published": "Publicado!",
        "delete": "Apagar publicação",
        "share": "Partilhar",
        "save": "Guardar",
        "report": "Denunciar",
        "no_interest": "Sem interesse",
        "placeholder": "Em que estás a pensar?",
        "photo": "Foto",
        "text": "Texto",
        "comment": "Comentar",
        "comments": "Comentários",
        "no_posts": "Ainda não tens publicações",
        "no_posts_sub": "Cria a tua primeira publicação acima!"
      },
      "settings": {
        "title": "Configurações",
        "appearance": "Aparência",
        "dark_mode": "Modo escuro",
        "light_mode": "Modo claro",
        "theme_desc": "Altera o tema da aplicação",
        "account": "Conta",
        "edit_profile": "Editar perfil",
        "edit_profile_desc": "Nome, foto, bio e mais",
        "notifications": "Notificações",
        "notifications_desc": "Gere os teus alertas",
        "activity": "Atividade",
        "activity_desc": "Histórico de ações",
        "privacy": "Privacidade",
        "privacy_desc": "Quem pode ver o teu perfil",
        "security": "Segurança",
        "security_desc": "Palavra-passe e autenticação",
        "language": "Idioma",
        "language_desc": "Escolhe o idioma da app",
        "support": "Suporte",
        "help": "Ajuda",
        "help_desc": "Perguntas frequentes",
        "about": "Sobre a Hooda",
        "about_desc": "Versão e informações legais",
        "msg_privacy": "Privacidade de Mensagens",
        "msg_privacy_desc": "Quem pode enviar-te mensagens diretas?",
        "msg_everyone": "Toda a gente",
        "msg_everyone_desc": "Qualquer utilizador pode escrever-te",
        "msg_followers": "Seguidores",
        "msg_followers_desc": "Apenas quem te segue",
        "msg_mutual": "Seguimento mútuo",
        "msg_mutual_desc": "Quem segues e te segue",
        "msg_approved": "Apenas aprovados",
        "msg_approved_desc": "Tens de aceitar cada pedido manualmente"
      },
      "tv": {
        "search": "Pesquisar vídeos e canais…",
        "videos": "Vídeos",
        "for_you": "Para Ti",
        "channels": "Canais",
        "following": "Seguindo",
        "views": "views",
        "no_videos": "Ainda não há vídeos publicados.",
        "no_channels": "Nenhum canal disponível ainda.",
        "follow": "+ Seguir",
        "following_btn": "A seguir ✓",
        "creators": "Descobre criadores da Hooda"
      },
      "common": {
        "loading": "A carregar...",
        "error": "Erro",
        "retry": "Tentar novamente",
        "close": "Fechar",
        "back": "Voltar",
        "search": "Pesquisar",
        "no_results": "Sem resultados",
        "version": "Versão"
      }
    }
  },
  "en": {
    "common": {
      "nav": {
        "home": "Home",
        "explore": "Explore",
        "tv": "HoodaTV",
        "messages": "Messages",
        "profile": "Profile"
      },
      "auth": {
        "signin": "Sign in",
        "signup": "Create account",
        "signout": "Sign out",
        "email": "Email",
        "password": "Password",
        "confirm_password": "Confirm password",
        "forgot_password": "Forgot password",
        "no_account": "Don't have an account?",
        "have_account": "Already have an account?",
        "loading": "Loading..."
      },
      "profile": {
        "edit": "Edit profile",
        "followers": "Followers",
        "following": "Following",
        "publications": "Posts",
        "follow": "Follow",
        "unfollow": "Following",
        "message": "Message",
        "bio": "Bio",
        "website": "Website",
        "location": "Location",
        "member_since": "Member since",
        "username": "Username",
        "full_name": "Full name",
        "save": "Save",
        "cancel": "Cancel",
        "username_available": "Available!",
        "username_taken": "This username is already taken.",
        "username_invalid": "Min. 3 characters. Only letters, numbers, . and _"
      },
      "post": {
        "create": "Create post",
        "publish": "Publish",
        "publishing": "Publishing...",
        "published": "Published!",
        "delete": "Delete post",
        "share": "Share",
        "save": "Save",
        "report": "Report",
        "no_interest": "Not interested",
        "placeholder": "What's on your mind?",
        "photo": "Photo",
        "text": "Text",
        "comment": "Comment",
        "comments": "Comments",
        "no_posts": "No posts yet",
        "no_posts_sub": "Create your first post above!"
      },
      "settings": {
        "title": "Settings",
        "appearance": "Appearance",
        "dark_mode": "Dark mode",
        "light_mode": "Light mode",
        "theme_desc": "Change app theme",
        "account": "Account",
        "edit_profile": "Edit profile",
        "edit_profile_desc": "Name, photo, bio and more",
        "notifications": "Notifications",
        "notifications_desc": "Manage your alerts",
        "activity": "Activity",
        "activity_desc": "Action history",
        "privacy": "Privacy",
        "privacy_desc": "Who can see your profile",
        "security": "Security",
        "security_desc": "Password and authentication",
        "language": "Language",
        "language_desc": "Choose app language",
        "support": "Support",
        "help": "Help",
        "help_desc": "Frequently asked questions",
        "about": "About Hooda",
        "about_desc": "Version and legal info",
        "msg_privacy": "Message Privacy",
        "msg_privacy_desc": "Who can send you direct messages?",
        "msg_everyone": "Everyone",
        "msg_everyone_desc": "Any user can message you",
        "msg_followers": "Followers",
        "msg_followers_desc": "Only people who follow you",
        "msg_mutual": "Mutual follow",
        "msg_mutual_desc": "People you follow and who follow you",
        "msg_approved": "Approved only",
        "msg_approved_desc": "You must accept each request manually"
      },
      "tv": {
        "search": "Search videos and channels…",
        "videos": "Videos",
        "for_you": "For You",
        "channels": "Channels",
        "following": "Following",
        "views": "views",
        "no_videos": "No videos published yet.",
        "no_channels": "No channels available yet.",
        "follow": "+ Follow",
        "following_btn": "Following ✓",
        "creators": "Discover Hooda creators"
      },
      "common": {
        "loading": "Loading...",
        "error": "Error",
        "retry": "Try again",
        "close": "Close",
        "back": "Back",
        "search": "Search",
        "no_results": "No results",
        "version": "Version"
      }
    }
  },
  "fr": {
    "common": {
      "nav": {
        "home": "Accueil",
        "explore": "Explorer",
        "tv": "HoodaTV",
        "messages": "Messages",
        "profile": "Profil"
      },
      "auth": {
        "signin": "Se connecter",
        "signup": "Créer un compte",
        "signout": "Se déconnecter",
        "email": "Email",
        "password": "Mot de passe",
        "confirm_password": "Confirmer le mot de passe",
        "forgot_password": "Mot de passe oublié",
        "no_account": "Pas encore de compte ?",
        "have_account": "Déjà un compte ?",
        "loading": "Chargement..."
      },
      "profile": {
        "edit": "Modifier le profil",
        "followers": "Abonnés",
        "following": "Abonnements",
        "publications": "Publications",
        "follow": "Suivre",
        "unfollow": "Abonné",
        "message": "Message",
        "bio": "Bio",
        "website": "Site web",
        "location": "Localisation",
        "member_since": "Membre depuis",
        "username": "Nom d'utilisateur",
        "full_name": "Nom complet",
        "save": "Enregistrer",
        "cancel": "Annuler",
        "username_available": "Disponible !",
        "username_taken": "Ce nom d'utilisateur est déjà pris.",
        "username_invalid": "Min. 3 caractères. Lettres, chiffres, . et _ uniquement"
      },
      "post": {
        "create": "Créer une publication",
        "publish": "Publier",
        "publishing": "Publication...",
        "published": "Publié !",
        "delete": "Supprimer",
        "share": "Partager",
        "save": "Enregistrer",
        "report": "Signaler",
        "no_interest": "Pas intéressé",
        "placeholder": "À quoi pensez-vous ?",
        "photo": "Photo",
        "text": "Texte",
        "comment": "Commenter",
        "comments": "Commentaires",
        "no_posts": "Aucune publication",
        "no_posts_sub": "Créez votre première publication !"
      },
      "settings": {
        "title": "Paramètres",
        "appearance": "Apparence",
        "dark_mode": "Mode sombre",
        "light_mode": "Mode clair",
        "theme_desc": "Changer le thème",
        "account": "Compte",
        "edit_profile": "Modifier le profil",
        "edit_profile_desc": "Nom, photo, bio et plus",
        "notifications": "Notifications",
        "notifications_desc": "Gérez vos alertes",
        "activity": "Activité",
        "activity_desc": "Historique des actions",
        "privacy": "Confidentialité",
        "privacy_desc": "Qui peut voir votre profil",
        "security": "Sécurité",
        "security_desc": "Mot de passe et authentification",
        "language": "Langue",
        "language_desc": "Choisir la langue",
        "support": "Support",
        "help": "Aide",
        "help_desc": "Questions fréquentes",
        "about": "À propos de Hooda",
        "about_desc": "Version et informations légales",
        "msg_privacy": "Confidentialité des messages",
        "msg_privacy_desc": "Qui peut vous envoyer des messages ?",
        "msg_everyone": "Tout le monde",
        "msg_everyone_desc": "N'importe quel utilisateur",
        "msg_followers": "Abonnés",
        "msg_followers_desc": "Uniquement vos abonnés",
        "msg_mutual": "Abonnement mutuel",
        "msg_mutual_desc": "Ceux que vous suivez et qui vous suivent",
        "msg_approved": "Approuvés uniquement",
        "msg_approved_desc": "Vous devez accepter chaque demande"
      },
      "tv": {
        "search": "Rechercher des vidéos et chaînes…",
        "videos": "Vidéos",
        "for_you": "Pour vous",
        "channels": "Chaînes",
        "following": "Abonnements",
        "views": "vues",
        "no_videos": "Aucune vidéo publiée.",
        "no_channels": "Aucune chaîne disponible.",
        "follow": "+ Suivre",
        "following_btn": "Abonné ✓",
        "creators": "Découvrez les créateurs Hooda"
      },
      "common": {
        "loading": "Chargement...",
        "error": "Erreur",
        "retry": "Réessayer",
        "close": "Fermer",
        "back": "Retour",
        "search": "Rechercher",
        "no_results": "Aucun résultat",
        "version": "Version"
      }
    }
  },
  "es": {
    "common": {
      "nav": {
        "home": "Inicio",
        "explore": "Explorar",
        "tv": "HoodaTV",
        "messages": "Mensajes",
        "profile": "Perfil"
      },
      "auth": {
        "signin": "Iniciar sesión",
        "signup": "Crear cuenta",
        "signout": "Cerrar sesión",
        "email": "Correo electrónico",
        "password": "Contraseña",
        "confirm_password": "Confirmar contraseña",
        "forgot_password": "Olvidé mi contraseña",
        "no_account": "¿No tienes cuenta?",
        "have_account": "¿Ya tienes cuenta?",
        "loading": "Cargando..."
      },
      "profile": {
        "edit": "Editar perfil",
        "followers": "Seguidores",
        "following": "Siguiendo",
        "publications": "Publicaciones",
        "follow": "Seguir",
        "unfollow": "Siguiendo",
        "message": "Mensaje",
        "bio": "Biografía",
        "website": "Sitio web",
        "location": "Ubicación",
        "member_since": "Miembro desde",
        "username": "Nombre de usuario",
        "full_name": "Nombre completo",
        "save": "Guardar",
        "cancel": "Cancelar",
        "username_available": "¡Disponible!",
        "username_taken": "Este nombre de usuario ya está en uso.",
        "username_invalid": "Mín. 3 caracteres. Solo letras, números, . y _"
      },
      "post": {
        "create": "Crear publicación",
        "publish": "Publicar",
        "publishing": "Publicando...",
        "published": "¡Publicado!",
        "delete": "Eliminar publicación",
        "share": "Compartir",
        "save": "Guardar",
        "report": "Denunciar",
        "no_interest": "Sin interés",
        "placeholder": "¿En qué estás pensando?",
        "photo": "Foto",
        "text": "Texto",
        "comment": "Comentar",
        "comments": "Comentarios",
        "no_posts": "Aún no tienes publicaciones",
        "no_posts_sub": "¡Crea tu primera publicación!"
      },
      "settings": {
        "title": "Configuración",
        "appearance": "Apariencia",
        "dark_mode": "Modo oscuro",
        "light_mode": "Modo claro",
        "theme_desc": "Cambiar el tema",
        "account": "Cuenta",
        "edit_profile": "Editar perfil",
        "edit_profile_desc": "Nombre, foto, bio y más",
        "notifications": "Notificaciones",
        "notifications_desc": "Gestiona tus alertas",
        "activity": "Actividad",
        "activity_desc": "Historial de acciones",
        "privacy": "Privacidad",
        "privacy_desc": "Quién puede ver tu perfil",
        "security": "Seguridad",
        "security_desc": "Contraseña y autenticación",
        "language": "Idioma",
        "language_desc": "Elige el idioma de la app",
        "support": "Soporte",
        "help": "Ayuda",
        "help_desc": "Preguntas frecuentes",
        "about": "Acerca de Hooda",
        "about_desc": "Versión e información legal",
        "msg_privacy": "Privacidad de mensajes",
        "msg_privacy_desc": "¿Quién puede enviarte mensajes?",
        "msg_everyone": "Todos",
        "msg_everyone_desc": "Cualquier usuario puede escribirte",
        "msg_followers": "Seguidores",
        "msg_followers_desc": "Solo quienes te siguen",
        "msg_mutual": "Seguimiento mutuo",
        "msg_mutual_desc": "A quienes sigues y te siguen",
        "msg_approved": "Solo aprobados",
        "msg_approved_desc": "Debes aceptar cada solicitud"
      },
      "tv": {
        "search": "Buscar vídeos y canales…",
        "videos": "Vídeos",
        "for_you": "Para ti",
        "channels": "Canales",
        "following": "Siguiendo",
        "views": "vistas",
        "no_videos": "Aún no hay vídeos.",
        "no_channels": "No hay canales disponibles.",
        "follow": "+ Seguir",
        "following_btn": "Siguiendo ✓",
        "creators": "Descubre creadores de Hooda"
      },
      "common": {
        "loading": "Cargando...",
        "error": "Error",
        "retry": "Intentar de nuevo",
        "close": "Cerrar",
        "back": "Volver",
        "search": "Buscar",
        "no_results": "Sin resultados",
        "version": "Versión"
      }
    }
  },
  "ar": {
    "common": {
      "nav": {
        "home": "الرئيسية",
        "explore": "استكشاف",
        "tv": "HoodaTV",
        "messages": "الرسائل",
        "profile": "الملف الشخصي"
      },
      "auth": {
        "signin": "تسجيل الدخول",
        "signup": "إنشاء حساب",
        "signout": "تسجيل الخروج",
        "email": "البريد الإلكتروني",
        "password": "كلمة المرور",
        "confirm_password": "تأكيد كلمة المرور",
        "forgot_password": "نسيت كلمة المرور",
        "no_account": "ليس لديك حساب؟",
        "have_account": "لديك حساب بالفعل؟",
        "loading": "جارٍ التحميل..."
      },
      "profile": {
        "edit": "تعديل الملف",
        "followers": "المتابعون",
        "following": "يتابع",
        "publications": "المنشورات",
        "follow": "متابعة",
        "unfollow": "يتابع",
        "message": "رسالة",
        "bio": "نبذة",
        "website": "الموقع",
        "location": "الموقع",
        "member_since": "عضو منذ",
        "username": "اسم المستخدم",
        "full_name": "الاسم الكامل",
        "save": "حفظ",
        "cancel": "إلغاء",
        "username_available": "متاح!",
        "username_taken": "اسم المستخدم مستخدم بالفعل.",
        "username_invalid": "٣ أحرف على الأقل. أحرف وأرقام و . و _ فقط"
      },
      "post": {
        "create": "إنشاء منشور",
        "publish": "نشر",
        "publishing": "جارٍ النشر...",
        "published": "تم النشر!",
        "delete": "حذف المنشور",
        "share": "مشاركة",
        "save": "حفظ",
        "report": "إبلاغ",
        "no_interest": "غير مهتم",
        "placeholder": "ماذا يدور في ذهنك؟",
        "photo": "صورة",
        "text": "نص",
        "comment": "تعليق",
        "comments": "التعليقات",
        "no_posts": "لا توجد منشورات بعد",
        "no_posts_sub": "أنشئ منشورك الأول!"
      },
      "settings": {
        "title": "الإعدادات",
        "appearance": "المظهر",
        "dark_mode": "الوضع الداكن",
        "light_mode": "الوضع الفاتح",
        "theme_desc": "تغيير سمة التطبيق",
        "account": "الحساب",
        "edit_profile": "تعديل الملف",
        "edit_profile_desc": "الاسم والصورة والنبذة والمزيد",
        "notifications": "الإشعارات",
        "notifications_desc": "إدارة تنبيهاتك",
        "activity": "النشاط",
        "activity_desc": "سجل الإجراءات",
        "privacy": "الخصوصية",
        "privacy_desc": "من يمكنه رؤية ملفك",
        "security": "الأمان",
        "security_desc": "كلمة المرور والمصادقة",
        "language": "اللغة",
        "language_desc": "اختر لغة التطبيق",
        "support": "الدعم",
        "help": "المساعدة",
        "help_desc": "الأسئلة الشائعة",
        "about": "حول Hooda",
        "about_desc": "الإصدار والمعلومات القانونية",
        "msg_privacy": "خصوصية الرسائل",
        "msg_privacy_desc": "من يمكنه إرسال رسائل مباشرة؟",
        "msg_everyone": "الجميع",
        "msg_everyone_desc": "أي مستخدم يمكنه مراسلتك",
        "msg_followers": "المتابعون",
        "msg_followers_desc": "فقط من يتابعونك",
        "msg_mutual": "تابع متبادل",
        "msg_mutual_desc": "من تتابعهم ويتابعونك",
        "msg_approved": "المعتمدون فقط",
        "msg_approved_desc": "يجب قبول كل طلب يدوياً"
      },
      "tv": {
        "search": "بحث في الفيديوهات والقنوات…",
        "videos": "فيديوهات",
        "for_you": "لك",
        "channels": "القنوات",
        "following": "المتابَعون",
        "views": "مشاهدة",
        "no_videos": "لا توجد فيديوهات منشورة.",
        "no_channels": "لا توجد قنوات متاحة.",
        "follow": "+ متابعة",
        "following_btn": "تتابع ✓",
        "creators": "اكتشف منشئي Hooda"
      },
      "common": {
        "loading": "جارٍ التحميل...",
        "error": "خطأ",
        "retry": "حاول مرة أخرى",
        "close": "إغلاق",
        "back": "رجوع",
        "search": "بحث",
        "no_results": "لا نتائج",
        "version": "الإصدار"
      }
    }
  }
};

const saved = typeof window !== "undefined" ? localStorage.getItem("hooda_lang") : null;
const browserLang = typeof navigator !== "undefined" ? navigator.language?.slice(0, 2) : "pt";
const supported = LANGUAGES.map(l => l.code);
const detected = (saved && supported.includes(saved as LangCode) ? saved : supported.includes(browserLang as LangCode) ? browserLang : "pt") as LangCode;

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: detected,
      fallbackLng: "pt",
      defaultNS: "common",
      ns: ["common"],
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
}

export function setLanguage(code: LangCode) {
  i18n.changeLanguage(code);
  if (typeof window !== "undefined") localStorage.setItem("hooda_lang", code);
  const lang = LANGUAGES.find(l => l.code === code);
  if (typeof document !== "undefined") {
    document.documentElement.dir = lang?.dir ?? "ltr";
    document.documentElement.lang = code;
  }
}

export function getCurrentLang(): LangCode {
  return (i18n.language?.slice(0, 2) as LangCode) ?? "pt";
}

export default i18n;
