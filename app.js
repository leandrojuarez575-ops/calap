// === 1. REGISTRO SERVICE WORKER ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.error("SW Error:", err));
}

// === 2. CONFIGURACIÓN DE CLAVES Y CLIENTES ===
const SUPABASE_URL = "https://qxxugkaowkoccbtcjjvp.supabase.co";
// Asegúrate de pegar tu 'anon public key' válida de Supabase Dashboard:
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4eHVna2Fvd2tvY2NidGNqanZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4OTQxNjgsImV4cCI6MjEwNjQ3MDE2OH0.tyzzV6D1yf9OZWQh8pnA5i2hsb-vG6QuUop30uuvQDs";

const WEATHER_API_KEY = "9969acc359b8f142850340fc6ef1d752";

// Obtener la API key de forma inteligente y segura
let GEMINI_API_KEY = (typeof CONFIG !== 'undefined' && CONFIG.GEMINI_API_KEY) 
  ? CONFIG.GEMINI_API_KEY 
  : localStorage.getItem('ASTROCAL_GEMINI_KEY') || "";

// Función para verificar si la clave está disponible y solicitarla si falta
function verificarApiKey() {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "FALTA_CONFIG_JS") {
    const claveIngresada = prompt("No se encontró una API Key de Gemini configurada.\nPor favor, ingresa tu API Key para continuar (se guardará de forma segura en tu navegador):");
    if (claveIngresada && claveIngresada.trim() !== "") {
      GEMINI_API_KEY = claveIngresada.trim();
      localStorage.setItem('ASTROCAL_GEMINI_KEY', GEMINI_API_KEY);
      alert("¡Clave guardada con éxito!");
      location.reload(); // Recarga para aplicar la clave
    } else {
      alert("Se necesita una API Key para que AstroCal pueda generar las respuestas.");
    }
  }
}

// Opcional: Puedes llamar a esta función justo antes de hacer la petición a la API
const supabaseClient = (window.supabase && typeof window.supabase.createClient === 'function')
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

  // === FUNCIÓN AUXILIAR DE FECHA LOCAL ===
function getLocalDateString(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function cambiarApiKey() {
  const nuevaClave = prompt("Ingresa tu nueva API Key de Gemini:", localStorage.getItem('ASTROCAL_GEMINI_KEY') || "");
  if (nuevaClave !== null) {
    localStorage.setItem('ASTROCAL_GEMINI_KEY', nuevaClave.trim());
    GEMINI_API_KEY = nuevaClave.trim();
    alert("API Key actualizada correctamente.");
    location.reload();
  }
}


// === 3. ESTADO GLOBAL ===
let currentUser = null;
let isAuthModeLogin = true;
let currentDate = new Date();
let selectedDateStr = getLocalDateString(new Date());
let eventos = {}; 
let ultimoClimaGuardado = null; // Guardar referencia del clima actual

document.addEventListener("DOMContentLoaded", () => {
  verificarSesion();
  obtenerClima();
  setupPWA();
});

// === 4. AUTENTICACIÓN Y SESIÓN ===
async function verificarSesion() {
  const localGuest = localStorage.getItem('guest_mode');
  if (localGuest === 'true') {
    currentUser = { id: 'invitado', email: 'invitado@local' };
    iniciarApp();
    return;
  }

  if (supabaseClient) {
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session) {
        currentUser = session.user;
        iniciarApp();
      } else {
        mostrarPantallaAuth();
      }
    } catch (e) {
      console.warn("Error al verificar sesión de Supabase:", e);
      mostrarPantallaAuth();
    }
  } else {
    mostrarPantallaAuth();
  }
}

function mostrarPantallaAuth() {
  const authScreen = document.getElementById("auth-screen");
  const appScreen = document.getElementById("app-screen");
  if (authScreen) authScreen.classList.add("active");
  if (appScreen) appScreen.classList.remove("active");
}

function toggleAuthMode() {
  isAuthModeLogin = !isAuthModeLogin;
  
  const authBtn = document.getElementById("auth-btn");
  const toggleText = document.getElementById("auth-toggle-text");
  const toggleBtn = document.getElementById("toggle-auth-btn");

  if (isAuthModeLogin) {
    if (authBtn) authBtn.innerText = "Iniciar Sesión";
    if (toggleText) toggleText.innerText = "¿No tenés cuenta?";
    if (toggleBtn) toggleBtn.innerText = "Registrarse";
  } else {
    if (authBtn) authBtn.innerText = "Crear Cuenta";
    if (toggleText) toggleText.innerText = "¿Ya tenés cuenta?";
    if (toggleBtn) toggleBtn.innerText = "Iniciar Sesión";
  }
}

async function handleAuth(e) {
  if (e) e.preventDefault();
  
  const emailInput = document.getElementById("auth-email");
  const passwordInput = document.getElementById("auth-password");
  
  const email = emailInput ? emailInput.value.trim() : "";
  const password = passwordInput ? passwordInput.value.trim() : "";

  if (!email || !password) {
    alert("Por favor, ingresa correo y contraseña.");
    return;
  }

  if (!supabaseClient) {
    alert("Iniciando en Modo Invitado / Local.");
    entrarModoInvitado();
    return;
  }

  try {
    if (isAuthModeLogin) {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        alert("Error al iniciar sesión: " + error.message);
      } else if (data && data.user) {
        currentUser = data.user;
        localStorage.removeItem('guest_mode');
        iniciarApp();
      }
    } else {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) {
        alert("Error en el registro: " + error.message);
      } else if (data && data.session) {
        alert("¡Registro exitoso!");
        currentUser = data.user;
        localStorage.removeItem('guest_mode');
        iniciarApp();
      } else {
        alert("¡Registro exitoso! Ya podés iniciar sesión.");
        toggleAuthMode();
      }
    }
  } catch (err) {
    console.error("Error en Auth:", err);
    alert("Error al conectar con el servicio de autenticación.");
  }
}

function entrarModoInvitado() {
  localStorage.setItem('guest_mode', 'true');
  currentUser = { id: 'invitado', email: 'invitado@local' };
  iniciarApp();
}

function cerrarSesion() {
  if (supabaseClient) supabaseClient.auth.signOut();
  localStorage.removeItem('guest_mode');
  location.reload();
}

function iniciarApp() {
  const authScreen = document.getElementById("auth-screen");
  const appScreen = document.getElementById("app-screen");
  const userStatus = document.getElementById("user-status");

  if (authScreen) authScreen.classList.remove("active");
  if (appScreen) appScreen.classList.add("active");
  if (userStatus && currentUser) {
    userStatus.innerText = `Usuario: ${currentUser.email}`;
  }

  cargarEventos();
  renderCalendario();
}

// === 5. CALENDARIO INTERACTIVO ===
function cambiarMes(delta) {
  currentDate.setMonth(currentDate.getMonth() + delta);
  renderCalendario();
}

function renderCalendario() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  const nombresMeses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const label = document.getElementById("month-year-label");
  if (label) label.innerText = `${nombresMeses[month]} ${year}`;

  const container = document.getElementById("calendar-days");
  if (!container) return;
  container.innerHTML = "";

  const primerDia = new Date(year, month, 1).getDay();
  const totalDias = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < primerDia; i++) {
    container.innerHTML += `<div></div>`;
  }

  for (let d = 1; d <= totalDias; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isSelected = dateStr === selectedDateStr ? 'selected' : '';
    const hasEvents = (eventos[dateStr] && eventos[dateStr].length > 0) ? 'has-events' : '';

    container.innerHTML += `
      <div class="day-cell ${isSelected} ${hasEvents}" onclick="seleccionarFecha('${dateStr}')">
        ${d}
      </div>
    `;
  }
  
  renderEventosDia();
}

function seleccionarFecha(dateStr) {
  selectedDateStr = dateStr;
  renderCalendario();
}

// === 6. EVENTOS (SUPABASE + LOCALSTORAGE) ===
async function cargarEventos() {
  if (supabaseClient && currentUser && currentUser.id !== 'invitado') {
    try {
      const { data, error } = await supabaseClient.from('eventos').select('*').eq('user_id', currentUser.id);
      if (!error && data) {
        eventos = {};
        data.forEach(e => {
          if (!eventos[e.fecha]) eventos[e.fecha] = [];
          eventos[e.fecha].push(e);
          programarNotificacionEvento(e);
        });
      } else {
        cargarEventosLocales();
      }
    } catch (e) {
      cargarEventosLocales();
    }
  } else {
    cargarEventosLocales();
  }
  
  renderCalendario();
  
  // Una vez cargados los eventos, volvemos a llamar a Gemini para incluir la agenda
  if (ultimoClimaGuardado) {
    generarCheckInGemini(ultimoClimaGuardado);
  }
}

function cargarEventosLocales() {
  try {
    eventos = JSON.parse(localStorage.getItem('eventos_local')) || {};
    Object.values(eventos).flat().forEach(e => programarNotificacionEvento(e));
  } catch (e) {
    eventos = {};
  }
}

function renderEventosDia() {
  const label = document.getElementById("selected-date-label");
  if (label) label.innerText = `Eventos (${selectedDateStr})`;

  const list = document.getElementById("event-list");
  if (!list) return;
  list.innerHTML = "";

  const listaDia = eventos[selectedDateStr] || [];
  if (listaDia.length === 0) {
    list.innerHTML = `<li style="color:#a6adc8; font-size:0.85rem;">No hay eventos para este día.</li>`;
    return;
  }

  listaDia.forEach((ev, idx) => {
    list.innerHTML += `
      <li class="event-item">
        <span><strong>${ev.hora}</strong> - ${ev.titulo}</span>
        <button onclick="eliminarEvento(${idx})" style="background:none;border:none;color:#f38ba8;cursor:pointer;">✕</button>
      </li>
    `;
  });
}

function abrirModalEvento() {
  const modal = document.getElementById("event-modal");
  if (modal) modal.classList.add("active");
}

function cerrarModalEvento() {
  const modal = document.getElementById("event-modal");
  if (modal) modal.classList.remove("active");
}

async function guardarEvento() {
  const tituloInput = document.getElementById("event-title");
  const horaInput = document.getElementById("event-time");
  
  const titulo = tituloInput ? tituloInput.value.trim() : "";
  const hora = horaInput ? horaInput.value : "12:00";

  if (!titulo) return;

  const nuevo = { titulo, hora, fecha: selectedDateStr, user_id: currentUser ? currentUser.id : 'invitado' };

  if (supabaseClient && currentUser && currentUser.id !== 'invitado') {
    try {
      const { data } = await supabaseClient.from('eventos').insert([nuevo]).select();
      if (data && data[0]) nuevo.id = data[0].id;
    } catch (e) {
      console.warn("No se pudo guardar en la nube, usando almacenamiento local.", e);
    }
  }

  if (!eventos[selectedDateStr]) eventos[selectedDateStr] = [];
  eventos[selectedDateStr].push(nuevo);
  localStorage.setItem('eventos_local', JSON.stringify(eventos));

  programarNotificacionEvento(nuevo);

  if (tituloInput) tituloInput.value = "";
  cerrarModalEvento();
  renderCalendario();

  // Actualizar la recomendación de la IA con la nueva agenda
  if (ultimoClimaGuardado) {
    generarCheckInGemini(ultimoClimaGuardado);
  }
}

async function eliminarEvento(idx) {
  const ev = eventos[selectedDateStr][idx];
  if (supabaseClient && currentUser && currentUser.id !== 'invitado' && ev && ev.id) {
    try {
      await supabaseClient.from('eventos').delete().eq('id', ev.id);
    } catch (e) {}
  }
  eventos[selectedDateStr].splice(idx, 1);
  localStorage.setItem('eventos_local', JSON.stringify(eventos));
  renderCalendario();

  if (ultimoClimaGuardado) {
    generarCheckInGemini(ultimoClimaGuardado);
  }
}

// === 7. SISTEMA DE NOTIFICACIONES PROGRAMADAS ===
function solicitarNotificacionesPush() {
  if (!('Notification' in window)) {
    alert("Este navegador no soporta notificaciones.");
    return;
  }

  Notification.requestPermission().then(perm => {
    if (perm === 'granted') {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification("AstroCal PWA", {
          body: "¡Notificaciones activadas! Te avisaremos a la hora de tus eventos.",
          icon: "icon.png"
        });
      });
    } else {
      alert("Permiso de notificaciones denegado.");
    }
  });
}

function programarNotificacionEvento(evento) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const fechaHoraEvento = new Date(`${evento.fecha}T${evento.hora}:00`);
  const ahora = new Date();
  const tiempoRestante = fechaHoraEvento.getTime() - ahora.getTime();

  if (tiempoRestante > 0) {
    setTimeout(() => {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(`⏰ Recordatorio: ${evento.titulo}`, {
          body: `Es hora de tu evento programado a las ${evento.hora}`,
          icon: "icon.png",
          vibrate: [200, 100, 200]
        });
      });
    }, tiempoRestante);
  }
}

// === 8. CLIMA Y GEMINI IA ===
function obtenerClima() {
  async function consultarOpenWeather(queryParam) {
    try {
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?${queryParam}&units=metric&lang=es&appid=${WEATHER_API_KEY}`);
      const data = await res.json();
      if (data.main) {
        ultimoClimaGuardado = data; // Guardar referencia global

        const cityEl = document.getElementById("city-name");
        const descEl = document.getElementById("weather-desc");
        const tempEl = document.getElementById("temp-display");

        if (cityEl) cityEl.innerText = data.name;
        if (descEl) descEl.innerText = data.weather[0].description;
        if (tempEl) tempEl.innerText = `${Math.round(data.main.temp)}°C`;
        
        generarCheckInGemini(data);
      }
    } catch (e) {
      console.warn("Error consultando la API de Clima, usando ubicación por defecto.", e);
    }
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        consultarOpenWeather(`lat=${lat}&lon=${lon}`);
      },
      () => {
        consultarOpenWeather(`q=La Rioja,AR`);
      }
    );
  } else {
    consultarOpenWeather(`q=La Rioja,AR`);
  }
}

// === GEMINI AVANZADO (COMBINA CLIMA Y CALENDARIO) ===
// Variable global auxiliar para conservar los datos de clima cargados
let climaActualCache = null;

async function generarCheckInGemini(climaData, estadoAnimo = null) {
  const promptEl = document.getElementById("ia-prompt");
  
  // Guardar clima en caché si vino como parámetro
  if (climaData) climaActualCache = climaData;
  const clima = climaData || climaActualCache;

  if (!GEMINI_API_KEY || GEMINI_API_KEY.includes("TU_GEMINI")) {
    if (promptEl) promptEl.innerText = "¡Hola! ¿Cómo se presenta tu día para encarar tus tareas?";
    return;
  }

  try {
    // 1. Clima de OpenWeather
    const desc = clima?.weather?.[0]?.description || 'despejado';
    const temp = Math.round(clima?.main?.temp || 20);
    const ciudad = clima?.name || 'tu ciudad';
    const humedad = clima?.main?.humidity || 50;

    // 2. Agenda del día
    const hoyStr = getLocalDateString(new Date());
    const eventosHoy = eventos[hoyStr] || [];
    let resumenAgenda = "sin eventos agendados";
    if (eventosHoy.length > 0) {
      resumenAgenda = eventosHoy.map(e => `"${e.titulo}" a las ${e.hora}`).join(", ");
    }

    // 3. Estado de ánimo (obtenido del parámetro o guardado localmente)
    const animo = estadoAnimo || localStorage.getItem(`checkin_${hoyStr}`) || "sin especificar";

    // Feedback inmediato en pantalla mientras Gemini genera el mensaje
    if (promptEl && estadoAnimo) {
      promptEl.innerText = `Consultando asistente para tu estado de ánimo (${estadoAnimo})...`;
    }

    // Prompt dinámico incluyendo el estado de ánimo
    const promptText = `Eres el asistente de la app AstroCal. Clima en ${ciudad}: ${desc}, ${temp}°C, humedad ${humedad}%. Agenda de hoy: ${resumenAgenda}. Estado de ánimo actual del usuario: ${animo}. Genera una frase motivadora o un consejo práctico acorde a cómo se siente en máximo 18 palabras. Sin comillas.`;

    // Lista de modelos a consultar
    const modelos = ["gemini-flash-latest", "gemini-3.5-flash", "gemini-3.1-flash-lite"];
    let result = null;

    for (const modelo of modelos) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }]
          })
        });

        if (response.ok) {
          result = await response.json();
          break;
        } else {
          console.warn(`Modelo ${modelo} devolvió estado ${response.status}, probando alternativa...`);
        }
      } catch (err) {
        console.warn(`Error al conectar con ${modelo}:`, err);
      }
    }

    if (!result) {
      if (promptEl) promptEl.innerText = "¡Hola! ¿Cómo se presenta tu día para encarar tus tareas?";
      return;
    }

    const textoRespuesta = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (textoRespuesta && promptEl) {
      promptEl.innerText = textoRespuesta.trim();
    }
  } catch (e) {
    console.warn("Error consultando Gemini API:", e);
    if (promptEl) promptEl.innerText = "¡Hola! ¿Cómo se presenta tu día para encarar tus tareas?";
  }
}

// Función que responden los botones del HTML
async function responderCheckIn(opcion) {
  console.log("Check-in seleccionado:", opcion);

  const hoyStr = getLocalDateString(new Date());
  localStorage.setItem(`checkin_${hoyStr}`, opcion);

  // 1. Guardar estado de ánimo de forma asíncrona en Supabase (si aplica)
  try {
    const client = typeof supabase !== 'undefined' ? supabase : (window.supabase || window.supabaseClient);
    if (client && client.auth) {
      const { data } = await client.auth.getSession();
      const user = data?.session?.user;

      if (user) {
        await client.from('checkins').insert([
          { user_id: user.id, estado_animo: opcion, fecha: new Date().toISOString() }
        ]);
      }
    }
  } catch (err) {
    console.warn("No se pudo guardar en base de datos, guardado localmente:", err);
  }

  // 2. Generar el mensaje de Gemini adaptado al estado seleccionado
  generarCheckInGemini(climaActualCache, opcion);
}

// Registrar en window para los eventos onclick del HTML
window.responderCheckIn = responderCheckIn;

// PRUEBA
// Función para procesar y guardar la respuesta de los botones de check-in


// === 9. VISTAS Y NAVEGACIÓN ===
function cambiarVista(vista, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  
  const targetView = document.getElementById(`view-${vista}`);
  if (targetView) targetView.classList.add('active');
  if (btn) btn.classList.add('active');
}

let deferredPrompt;
function setupPWA() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById("install-pwa-btn");
    if (btn) {
      btn.style.display = "block";
      btn.onclick = () => deferredPrompt.prompt();
    }
  });
}