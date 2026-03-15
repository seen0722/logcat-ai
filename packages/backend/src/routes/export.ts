import { Router, Request, Response } from 'express';
import { analysisStore } from '../store.js';
import { exportAsJSON } from '../export/json-exporter.js';
import { exportAsHTML } from '../export/html-exporter.js';
import { exportPowerReport } from '../export/power-report-exporter.js';
import { exportTelephonyReport } from '../export/telephony-report-exporter.js';

const router = Router();

router.get('/:id/:format', (req: Request, res: Response) => {
  const id = String(req.params.id);
  const format = String(req.params.format);
  const result = analysisStore.get(id);

  if (!result) {
    return res.status(404).json({ error: 'Analysis not found' });
  }

  switch (format) {
    case 'json': {
      const json = exportAsJSON(result);
      const filename = `logcat-ai-report-${id.slice(0, 8)}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(json);
    }
    case 'html': {
      const html = exportAsHTML(result);
      const filename = `logcat-ai-report-${id.slice(0, 8)}.html`;
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(html);
    }
    case 'power-html': {
      const powerHtml = exportPowerReport(result);
      const filename = `power-report-${id.slice(0, 8)}.html`;
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(powerHtml);
    }
    case 'telephony-html': {
      const telHtml = exportTelephonyReport(result);
      const filename = `telephony-report-${id.slice(0, 8)}.html`;
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(telHtml);
    }
    default:
      return res.status(400).json({ error: `Unsupported format: ${format}. Use json, html, power-html, or telephony-html.` });
  }
});

export default router;
