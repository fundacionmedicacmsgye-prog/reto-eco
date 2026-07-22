
// Función Netlify: guarda el prospecto del Reto ECO Materno-Fetal (Ecografía Obstétrica)
// y genera con Claude API (1) el mensaje de apertura para el asesor y (2) el reporte
// completo del médico. Espejo de guardar-prospecto.js, apuntando a la tabla nueva
// prospectos_eco_obstetrico (NO toca prospectos_eco).
// Variables de entorno requeridas en Netlify (las mismas del proyecto actual):
//   SUPABASE_URL, SUPABASE_SERVICE_KEY, ANTHROPIC_API_KEY
/* ===== Diccionarios para traducir códigos a texto humano ===== */
const T = {
  perfil_profesional: {
    gineco_obstetra: 'Gineco-obstetra', general_embarazo: 'Médico general que atiende embarazadas',
    rural: 'Médico rural', residente: 'Residente (ginecología/medicina familiar)',
    emergencia: 'Médico de emergencia', otro: 'Otro profesional de la salud'
  },
  pacientes_mes: {
    menos_50: 'menos de 50 pacientes embarazadas/mes', '50_100': '50–100 pacientes embarazadas/mes',
    '101_200': '101–200 pacientes embarazadas/mes', '201_400': '201–400 pacientes embarazadas/mes',
    mas_400: 'más de 400 pacientes embarazadas/mes'
  },
  realiza_ecografias: {
    frecuente: 'realiza ecografías obstétricas con frecuencia', ocasional: 'realiza ecografías obstétricas ocasionalmente',
    interpreta: 'solo observa o interpreta casos', quiere_aprender: 'no realiza, pero quiere aprender',
    nunca: 'nunca ha tenido contacto con la ecografía obstétrica'
  },
  etapa_profesional: {
    busca_empleo: 'buscando empleo estable', mejor_puesto: 'empleado, busca mejor puesto',
    consulta_propia: 'tiene consulta propia', postgrado_rural: 'preparando postgrado o rural'
  },
  objetivo_principal: {
    evaluar_pacientes: 'evaluar mejor a sus pacientes embarazadas', complementar: 'complementar su consulta obstétrica/ginecológica',
    centro_medico: 'trabajar en un centro materno-fetal u hospital', nuevo_servicio: 'incorporar la ecografía obstétrica como nuevo servicio',
    perfil_laboral: 'mejorar su perfil profesional en salud materna', emprender: 'emprender con un servicio de ecografía obstétrica'
  },
  objecion_principal: {
    falta_formacion: 'falta de formación estructurada', sin_equipo: 'no tiene ecógrafo',
    no_conoce: 'no conoce el proceso para empezar', falta_tiempo: 'falta de tiempo',
    costo: 'el costo de la capacitación', inseguridad: 'no sabe si podrá aprender'
  },
  nivel_resultado: {
    explorador: 'Explorador', en_desarrollo: 'En Desarrollo',
    clinico_progreso: 'Clínico en Progreso', avanzado: 'Avanzado'
  },
  categorias: {
    c1: 'embarazo temprano y viabilidad', c2: 'screening del primer trimestre',
    c3: 'biometría del segundo trimestre', c4: 'Doppler obstétrico',
    c5: 'bienestar fetal (perfil biofísico)', c6: 'evaluación cervical (Sistema Bethesda)'
  }
};
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Método no permitido' }) };
  }
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  let registro;
  try {
    registro = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Cuerpo inválido' }) };
  }
  /* ===== 1. Generar mensaje de apertura + reporte con Claude ===== */
  let mensajeApertura = null;
  let reporteMedico = null;
  try {
    const aciertos = (registro.respuestas_detalle || [])
      .filter(d => d.correcta)
      .map(d => T.categorias[d.pregunta] || d.pregunta);
    const areasDebiles = (registro.respuestas_detalle || [])
      .filter(d => !d.correcta)
      .map(d => T.categorias[d.pregunta] || d.pregunta);
    const perfilTexto = `
- Nombre: ${registro.nombre}
- País: ${registro.pais}
- Perfil: ${T.perfil_profesional[registro.perfil_profesional] || registro.perfil_profesional}
- Volumen: ${T.pacientes_mes[registro.pacientes_mes] || 'no indicado'}
- Experiencia en eco obstétrica: ${T.realiza_ecografias[registro.realiza_ecografias] || 'no indicada'}
- Etapa profesional: ${T.etapa_profesional[registro.etapa_profesional] || 'no indicada'}
- Resultado: Nivel ${T.nivel_resultado[registro.nivel_resultado]} (${registro.puntaje_conocimiento}% de conocimiento)
- Áreas dominadas: ${aciertos.length ? aciertos.join(', ') : 'ninguna'}
- Áreas débiles: ${areasDebiles.length ? areasDebiles.join(', ') : 'ninguna, acertó todo'}
- Objetivo al especializarse en ecografía obstétrica: ${T.objetivo_principal[registro.objetivo_principal] || 'no indicado'}
- Lo que le impide comenzar: ${T.objecion_principal[registro.objecion_principal] || 'no indicado'}
- Potencial que él mismo calculó: $${registro.potencial_mensual || 0} mensuales brutos`;
    const prompt = `Eres el asesor académico de FMC (Formación Médica Continua), institución ecuatoriana que dicta un Diplomado Internacional de Ecografía Obstétrica, Doppler Obstétrico y Evaluación Cervical/Colposcopia, de 7 meses, con clases en vivo, talleres prácticos, casos clínicos reales, prácticas presenciales supervisadas y certificación. Un médico completó la evaluación gratuita "Reto ECO Materno-Fetal".
Datos del prospecto:
${perfilTexto}
Genera DOS textos:
TEXTO 1 - "mensaje_apertura": El PRIMER mensaje de WhatsApp que el asesor le enviará.
Reglas: español, tono cálido y profesional de colega a colega ("Doctor/Doctora" según el nombre). Máximo 90 palabras. Demuestra que revisaste SU resultado: menciona su nivel y UNA área débil concreta (si acertó todo, felicita su base). Aborda sutilmente su objeción sin sonar vendedor (sin equipo → puede formarse antes de esa inversión; costo → existen opciones de pago; inseguridad → el programa va de lo básico a lo clínico). Conecta con SU objetivo. Cierra ofreciendo su reporte completo y una orientación breve sin compromiso, con una pregunta simple. NO prometas ingresos ni empleo. NO menciones precio, cuotas, becas ni condiciones de pago de ningún tipo. Máximo 1 emoji.
TEXTO 2 - "reporte": El REPORTE COMPLETO que el médico recibirá por WhatsApp. Formato para WhatsApp: usa *asteriscos* para negritas, guiones para listas, saltos de línea entre secciones. Entre 200 y 300 palabras. Estructura:
*REPORTE RETO ECO MATERNO-FETAL – FMC*
*[Nombre del médico]*
*Tu nivel:* [nivel] ([X]% de conocimiento) + 1-2 líneas interpretando qué significa para su práctica obstétrica.
*Fortalezas:* lista de áreas dominadas (si no hay, omite la sección y sé constructivo).
*Áreas a fortalecer:* lista de áreas débiles con 1 línea de por qué cada una importa clínicamente en la atención materno-fetal (si no hay, felicita).
*Tu potencial:* el cálculo de $X mensuales que él mismo estimó, aclarando en una línea que es una simulación orientativa que depende de demanda, normativa y costos locales.
*Recomendación:* 2-3 líneas personalizadas a su nivel, objetivo y etapa profesional. Si su etapa es de búsqueda de empleo o mejora laboral, menciona que la ecografía obstétrica es una competencia valorada en el mercado (sin garantizar empleo).
*Siguiente paso:* invitación cordial a una orientación gratuita con FMC sobre cómo desarrollar esta especialización de forma estructurada.
Tono: educativo, honesto, profesional. NO promesas de ingresos ni empleo garantizado. NO menciones precio, matrícula, cuotas, becas ni ninguna condición de pago o financiamiento del diplomado en ningún momento.
Responde ÚNICAMENTE con un JSON válido, sin markdown ni backticks:
{"mensaje_apertura": "...", "reporte": "..."}`;
    const respIA = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (respIA.ok) {
      const data = await respIA.json();
      const texto = (data.content || [])
        .map(b => (b.type === 'text' ? b.text : ''))
        .join('')
        .replace(/```json|```/g, '')
        .trim();
      try {
        const parseado = JSON.parse(texto);
        mensajeApertura = parseado.mensaje_apertura || null;
        reporteMedico = parseado.reporte || null;
      } catch (e) {
        console.error('No se pudo parsear JSON de Claude, guardando texto crudo');
        mensajeApertura = texto.slice(0, 1000);
      }
    } else {
      console.error('Error Claude API:', respIA.status, await respIA.text());
    }
  } catch (e) {
    console.error('Fallo generando textos:', e);
  }
  /* ===== 2. Guardar en Supabase (tabla NUEVA: prospectos_eco_obstetrico) ===== */
  registro.mensaje_apertura = mensajeApertura;
  registro.reporte_medico = reporteMedico;
  try {
    const respDB = await fetch(SUPABASE_URL + '/rest/v1/prospectos_eco_obstetrico', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(registro)
    });
    if (!respDB.ok) {
      const detalle = await respDB.text();
      console.error('Error Supabase:', respDB.status, detalle);
      return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'No se pudo guardar' }) };
    }
  } catch (e) {
    console.error('Fallo de red con Supabase:', e);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'Error de conexión' }) };
  }
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true })
  };
};
