/* ==========================================================================
   DASHBOARD SAVID / STJ - LÓGICA TEMPORAL E ALERTA DE VOZ (JS COMPLETO)
   ========================================================================== */

const CONFIG = {
    CLOCK_INTERVAL_MS: 1000,      // Atualização do relógio a cada 1 segundo
    DATA_REFRESH_MS: 30000,       // Reconsulta a planilha/SharePoint a cada 30 segundos
    DATA_ENDPOINT_URL: 'dados-escala.json',
    ALERT_WINDOW_MINUTES: 20      // Janela de alerta de 20 minutos
};

// Estrutura de dados padrão
let currentDashboardData = {
    events: [
        {
            id: 'evt-1',
            timeStart: '16:30',
            timeEnd: '18:00',
            location: 'Sala de Videoconferências II',
            title: 'Testes - Comitê Gestor do Humaniza STJ',
            tech: 'Arthur',
            isFinished: false
        },
        {
            id: 'evt-2',
            timeStart: '17:00',
            timeEnd: '18:30',
            location: 'Salão de Recepções',
            title: 'Saber Universitário da Justiça',
            tech: 'Ramon, Daniel Lorenzo',
            isFinished: false
        }
    ],
    adminStaff: [
        { shift: 'Manhã / Tarde', name: 'Joabe', isSupervisor: false },
        { shift: 'Manhã / Tarde', name: 'Daniel Lorenzo', isSupervisor: false },
        { shift: 'Manhã / Tarde', name: 'Felipe', isSupervisor: false },
        { shift: 'Supervisor', name: 'Sérgio Amorim', isSupervisor: true }
    ]
};

// Controle de alertas sonoros já disparados (para não repetir a cada segundo)
const spokenAlerts = new Set();

/* --- 1. SÍNTESE DE VOZ (TEXT-TO-SPEECH) --- */
function speakAlert(techNames, eventTitle) {
    if (!('speechSynthesis' in window)) {
        console.warn('Este navegador não suporta síntese de voz.');
        return;
    }

    // Cancela falas anteriores para não encavalar o áudio
    window.speechSynthesis.cancel();

    // Monta a frase personalizada solicitada
    const textToSpeak = `${techNames}, a demanda "${eventTitle}" que vocês estão escalados, terá início em 20 minutos.`;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'pt-BR'; // Define o idioma para Português do Brasil
    utterance.rate = 0.95;    // Velocidade levemente ajustada para clareza
    utterance.pitch = 1.0;   // Tom de voz normal

    // Seleciona uma voz em Português disponível no sistema
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(voice => voice.lang.includes('pt') || voice.lang.includes('PT'));
    if (ptVoice) {
        utterance.voice = ptVoice;
    }

    // Toca o áudio
    window.speechSynthesis.speak(utterance);
}

/* --- 2. RELÓGIO DIGITAL E DATA --- */
function updateClock() {
    const now = new Date();
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const clockElement = document.getElementById('live-clock');
    if (clockElement) clockElement.textContent = `${hours}:${minutes}:${seconds}`;

    const options = { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' };
    const dateElement = document.getElementById('live-date');
    if (dateElement) dateElement.textContent = now.toLocaleDateString('pt-BR', options);

    evaluateEventsTiming(now);
}

/* --- 3. CONVERSOR DE HORÁRIO --- */
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const cleanStr = String(timeStr).toLowerCase().replace('h', ':');
    const parts = cleanStr.split(':');
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

/* --- 4. AVALIAÇÃO TEMPORAL E DISPARO DE VOZ --- */
function evaluateEventsTiming(now) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    let activeOrAlertEvents = [];
    let scheduleRows = [];

    if (!currentDashboardData.events) return;

    currentDashboardData.events.forEach((evt, index) => {
        const eventId = evt.id || `evt-${index}-${evt.timeStart}`;
        const startMin = timeToMinutes(evt.timeStart);
        const endMin = timeToMinutes(evt.timeEnd);
        
        let statusLabel = 'Agendado';
        let statusClass = 'sim-status-normal';
        let isAlert = false;
        let displayState = 'upcoming';

        // REGRA 1: Evento Terminado
        if (evt.isFinished || (endMin > 0 && currentMinutes > endMin)) {
            statusLabel = 'Terminado';
            statusClass = 'sim-status-finished';
            displayState = 'finished';
        } 
        // REGRA 2: Evento Em Andamento
        else if (currentMinutes >= startMin && (endMin === 0 || currentMinutes <= endMin)) {
            statusLabel = 'Em Andamento';
            statusClass = 'sim-status-active';
            isAlert = true;
            displayState = 'ongoing';
        } 
        // REGRA 3: Alerta de 20 minutos antes do início
        else {
            const diffMin = startMin - currentMinutes;
            if (diffMin > 0 && diffMin <= CONFIG.ALERT_WINDOW_MINUTES) {
                statusLabel = `Inicia em ${diffMin} min`;
                statusClass = 'sim-status-alert';
                isAlert = true;
                displayState = 'ongoing';

                // 🔊 DISPARO DO ALERTA DE VOZ (Gatilho Único)
                if (!spokenAlerts.has(eventId)) {
                    speakAlert(evt.tech, evt.title);
                    spokenAlerts.add(eventId); // Marca para não falar novamente nesta sessão
                }
            }
        }

        if (displayState === 'ongoing') {
            activeOrAlertEvents.push({ ...evt, statusLabel, statusClass, isAlert });
        }

        scheduleRows.push({ ...evt, statusLabel, statusClass, displayState });
    });

    renderSimultaneousEvents(activeOrAlertEvents);
    renderScheduleTable(scheduleRows);
}

/* --- 5. RENDERIZAÇÃO DOS EVENTOS SIMULTÂNEOS --- */
function renderSimultaneousEvents(events) {
    const container = document.getElementById('simultaneous-grid');
    if (!container) return;

    container.innerHTML = '';

    if (!events || events.length === 0) {
        container.innerHTML = `
            <div class="simultaneous-card">
                <div class="sim-title" style="color: var(--text-muted); font-weight: normal; font-size: 0.875rem;">
                    <i class="fa-solid fa-circle-check" style="color: var(--stj-green); margin-right: 0.5rem;"></i>
                    Nenhuma demanda iminente ou em andamento neste momento.
                </div>
            </div>
        `;
        return;
    }

    events.forEach(evt => {
        const card = document.createElement('div');
        card.className = `simultaneous-card ${evt.isAlert ? 'alert-active' : ''}`;
        const timeDisplay = evt.timeEnd ? `${evt.timeStart} - ${evt.timeEnd}` : evt.timeStart;

        card.innerHTML = `
            <div class="sim-card-header">
                <span class="sim-time"><i class="fa-solid fa-clock"></i> ${timeDisplay}</span>
                <span class="sim-location">${evt.location}</span>
            </div>
            <div class="sim-title">${evt.title}</div>
            <div class="sim-footer">
                <span class="sim-tech"><i class="fa-solid fa-user-gear"></i> ${evt.tech}</span>
                <span class="${evt.statusClass}">${evt.statusLabel}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

/* --- 6. RENDERIZAÇÃO DA ESCALA COMPLETA --- */
function renderScheduleTable(schedule) {
    const tbody = document.getElementById('schedule-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    schedule.forEach(item => {
        const row = document.createElement('tr');
        if (item.displayState === 'ongoing') {
            row.className = 'row-active-event';
        } else if (item.displayState === 'finished') {
            row.style.opacity = '0.55';
        }

        const timeDisplay = item.timeEnd ? `${item.timeStart} - ${item.timeEnd}` : item.timeStart;

        row.innerHTML = `
            <td class="time-col">${timeDisplay}</td>
            <td class="event-col ${item.displayState === 'ongoing' ? 'font-bold' : ''}">
                <strong>${item.location}</strong> — ${item.title}
            </td>
            <td class="staff-col ${item.displayState === 'ongoing' ? 'font-bold' : ''}">${item.tech}</td>
            <td class="status-col">
                <span class="${item.statusClass}">${item.statusLabel}</span>
            </td>
        `;
        tbody.appendChild(row);
    });
}

/* --- 7. EQUIPE TÉCNICO-ADMINISTRATIVA --- */
function renderAdminStaff(staffList) {
    const container = document.getElementById('continuous-staff-grid');
    if (!container) return;

    container.innerHTML = '';
    if (!staffList) return;

    staffList.forEach(member => {
        const box = document.createElement('div');
        box.className = 'staff-box';
        const nameClass = member.isSupervisor ? 'staff-name supervisor-name' : 'staff-name';

        box.innerHTML = `
            <span class="staff-shift">${member.shift}</span>
            <span class="${nameClass}">${member.name}</span>
        `;
        container.appendChild(box);
    });
}

/* --- 8. CONSULTA AUTOMÁTICA DE DADOS --- */
async function fetchDashboardData() {
    try {
        const response = await fetch(CONFIG.DATA_ENDPOINT_URL, { cache: 'no-cache' });
        if (response.ok) {
            const data = await response.json();
            currentDashboardData = data;
        }
    } catch (error) {
        console.warn('Usando dados da memória local:', error.message);
    } finally {
        if (currentDashboardData.adminStaff) {
            renderAdminStaff(currentDashboardData.adminStaff);
        }
    }
}

/* --- 9. INICIALIZAÇÃO --- */
document.addEventListener('DOMContentLoaded', () => {
    // Garante o carregamento prévio das vozes do navegador
    if ('speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }

    fetchDashboardData();
    setInterval(fetchDashboardData, CONFIG.DATA_REFRESH_MS);

    updateClock();
    setInterval(updateClock, CONFIG.CLOCK_INTERVAL_MS);
});

function testarAlertaVoz() {
    // Simula um teste com os dados do primeiro evento da lista
    if (currentDashboardData.events && currentDashboardData.events.length > 0) {
        const evt = currentDashboardData.events[0];
        speakAlert(evt.tech, evt.title);
    } else {
        speakAlert("Arthur e Ramon", "Teste de Sistema SAVID");
    }
}