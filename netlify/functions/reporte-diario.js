// Función Netlify: reporte diario automático por email con los leads generados
// en el día en Reto ECO (general) y Reto ECO Materno-Fetal (Obstétrico).
//
// Se ejecuta automáticamente todos los días a las 20:00 (hora de Guayaquil / Ecuador,
// UTC-5 todo el año) según el schedule configurado en netlify.toml (cron "0 1 * * *" en UTC).
// También se puede disparar manualmente (por ejemplo para probarlo) haciendo un GET
// a esta función con el header x-pin igual al PIN del panel.
//
// Variables de entorno requeridas (además de las ya existentes SUPABASE_URL y
// SUPABASE_SERVICE_KEY):
//   RESEND_API_KEY        → API key de una cuenta gratuita en https://resend.com
//   EMAIL_REPORTE_DESTINO → correo(s) donde llega el reporte (separados por coma si son varios).
//                           IMPORTANTE: mientras no se verifique un dominio propio en Resend,
//                           solo se puede enviar al correo con el que se creó la cuenta de Resend.
//   EMAIL_REPORTE_REMITENTE (opcional) → remitente a mostrar, por defecto "onboarding@resend.dev"
//
// PANEL_PIN ya existe (mismo PIN del panel) y se reutiliza para permitir disparo manual.

const AJUSTE_HORAS_GYE = 5; // Ecuador = UTC-5, sin horario de verano

function inicioDelDiaGuayaquilEnUTC(ahora) {
  const local = new Date(ahora.getTime() - AJUSTE_HORAS_GYE * 3600 * 1000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + AJUSTE_HORAS_GYE * 3600 * 1000);
}

function formatoFechaGuayaquil(ahora) {
  const local = new Date(ahora.getTime() - AJUSTE_HORAS_GYE * 3600 * 1000);
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${dias[local.getUTCDay()]} ${local.getUTCDate()} de ${meses[local.getUTCMonth()]} de ${local.getUTCFullYear()}`;
}

function formatoHoraGuayaquil(fechaISO) {
  const d = new Date(new Date(fechaISO).getTime() - AJUSTE_HORAS_GYE * 3600 * 1000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function obtenerLeadsDelDia(SUPABASE_URL, cab, tabla, inicioISO, finISO) {
  const url = `${SUPABASE_URL}/rest/v1/${tabla}?select=*&created_at=gte.${encodeURIComponent(inicioISO)}&created_at=lte.${encodeURIComponent(finISO)}&order=created_at.asc`;
  const r = await fetch(url, { headers: cab });
  if (!r.ok) {
    console.error(`Error Supabase GET ${tabla}:`, r.status, await r.text());
    return [];
  }
  return r.json();
}

function seccionFunnel(nombreFunnel, leads, panelUrl) {
  if (!leads.length) {
    return `<h3 style="margin:24px 0 8px;color:#0B1520;">${nombreFunnel}: sin leads nuevos hoy</h3>`;
  }
  const cat = { A: 0, B: 0, C: 0 };
  leads.forEach(l => { if (cat[l.categoria_lead] !== undefined) cat[l.categoria_lead]++; });

  const filas = leads.map(l => {
    const digitos = String(l.whatsapp || '').replace(/\D/g, '');
    const waLink = digitos ? `https://wa.me/${digitos}` : '';
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${formatoHoraGuayaquil(l.created_at)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;"><strong>${escapeHtml(l.nombre)}</strong><br><span style="color:#64748b;font-size:12px;">${escapeHtml(l.pais || '')}</span></td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center;">
        <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-weight:bold;font-size:12px;
          background:${l.categoria_lead === 'A' ? '#d1fae5' : l.categoria_lead === 'B' ? '#fef3c7' : '#fee2e2'};
          color:${l.categoria_lead === 'A' ? '#065f46' : l.categoria_lead === 'B' ? '#92400e' : '#991b1b'};">
          ${escapeHtml(l.categoria_lead || '-')}
        </span>
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(l.avatar || '-')}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${escapeHtml(l.objetivo_principal || '-')}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${waLink ? `<a href="${waLink}" style="color:#0d9488;">WhatsApp →</a>` : '-'}</td>
    </tr>`;
  }).join('');

  return `
    <h3 style="margin:24px 0 4px;color:#0B1520;">${nombreFunnel}: ${leads.length} lead${leads.length === 1 ? '' : 's'} nuevo${leads.length === 1 ? '' : 's'}
      <span style="font-weight:normal;font-size:14px;color:#475569;">
        (A: ${cat.A} · B: ${cat.B} · C: ${cat.C})
      </span>
    </h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;font-family:Arial,sans-serif;">
      <thead>
        <tr style="background:#0B1520;color:#fff;">
          <th style="padding:6px 8px;text-align:left;">Hora</th>
          <th style="padding:6px 8px;text-align:left;">Nombre / País</th>
          <th style="padding:6px 8px;">Cat.</th>
          <th style="padding:6px 8px;text-align:left;">Avatar</th>
          <th style="padding:6px 8px;text-align:left;">Objetivo</th>
          <th style="padding:6px 8px;text-align:left;">Contacto</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
    <p style="margin:8px 0 0;"><a href="${panelUrl}" style="color:#0d9488;font-size:13px;">Ver en el panel →</a></p>
  `;
}

exports.handler = async (event) => {
  // Seguridad: solo se ejecuta si viene del scheduler de Netlify, o si viene
  // con el PIN correcto del panel (para pruebas manuales).
  const esInvocacionProgramada = (event.headers && (event.headers['x-netlify-event'] === 'schedule'));
  const PINES = (process.env.PANEL_PIN || '').split(',').map(p => p.trim()).filter(Boolean);
  const pinRecibido = (event.headers && (event.headers['x-pin'] || event.headers['X-Pin']) || '').trim();
  const pinValido = PINES.length && PINES.includes(pinRecibido);

  if (!esInvocacionProgramada && !pinValido) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'No autorizado' }) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const DESTINO = (process.env.EMAIL_REPORTE_DESTINO || '').split(',').map(s => s.trim()).filter(Boolean);
  const REMITENTE = process.env.EMAIL_REPORTE_REMITENTE || 'onboarding@resend.dev';

  if (!RESEND_API_KEY || !DESTINO.length) {
    console.error('Falta RESEND_API_KEY o EMAIL_REPORTE_DESTINO');
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Faltan variables de entorno de email' }) };
  }

  const cab = {
    apikey: KEY,
    Authorization: 'Bearer ' + KEY,
    'Content-Type': 'application/json'
  };

  const ahora = new Date();
  const inicio = inicioDelDiaGuayaquilEnUTC(ahora);

  try {
    const [leadsGeneral, leadsObstetrico] = await Promise.all([
      obtenerLeadsDelDia(SUPABASE_URL, cab, 'prospectos_eco', inicio.toISOString(), ahora.toISOString()),
      obtenerLeadsDelDia(SUPABASE_URL, cab, 'prospectos_eco_obstetrico', inicio.toISOString(), ahora.toISOString())
    ]);

    const totalLeads = leadsGeneral.length + leadsObstetrico.length;
    const totalA = [...leadsGeneral, ...leadsObstetrico].filter(l => l.categoria_lead === 'A').length;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;">
        <div style="background:#0B1520;color:#6FE3D4;padding:16px 20px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;">Reto ECO — Resumen del día</h2>
          <p style="margin:4px 0 0;color:#e2e8f0;font-size:14px;">${formatoFechaGuayaquil(ahora)}</p>
        </div>
        <div style="padding:16px 20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
          <p style="font-size:16px;">
            <strong>${totalLeads}</strong> lead${totalLeads === 1 ? '' : 's'} nuevo${totalLeads === 1 ? '' : 's'} hoy
            ${totalA ? ` — <strong style="color:#065f46;">${totalA} categoría A</strong> (contactar cuanto antes)` : ''}
          </p>
          ${seccionFunnel('Reto ECO (general)', leadsGeneral, 'https://reto-eco.netlify.app/panel.html')}
          ${seccionFunnel('Reto ECO Obstétrico', leadsObstetrico, 'https://reto-eco.netlify.app/panel-obstetrico.html')}
        </div>
      </div>
    `;

    const asunto = totalA
      ? `Reto ECO: ${totalLeads} leads hoy (${totalA} categoría A) — ${formatoFechaGuayaquil(ahora)}`
      : `Reto ECO: ${totalLeads} leads hoy — ${formatoFechaGuayaquil(ahora)}`;

    const rEmail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `Reto ECO <${REMITENTE}>`,
        to: DESTINO,
        subject: asunto,
        html
      })
    });

    if (!rEmail.ok) {
      const detalle = await rEmail.text();
      console.error('Error al enviar email con Resend:', rEmail.status, detalle);
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Error al enviar el email', detalle }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, totalLeads, totalA }) };
  } catch (e) {
    console.error('Fallo al generar/enviar el reporte diario:', e);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Error de conexión' }) };
  }
};
