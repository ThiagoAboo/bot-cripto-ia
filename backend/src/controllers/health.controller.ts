import { Request, Response } from 'express'

import { getOperationalHealthReport } from '../services/health.service'

export async function getLiveness(_req: Request, res: Response): Promise<Response> {
  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  })
}

export async function getReadiness(_req: Request, res: Response): Promise<Response> {
  const report = await getOperationalHealthReport()
  const statusCode = report.status === 'ok' ? 200 : 503

  return res.status(statusCode).json(report)
}

