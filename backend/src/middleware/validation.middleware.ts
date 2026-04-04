import { Request, Response, NextFunction } from 'express'
import { AnyZodObject, ZodError } from 'zod'

export function validate(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params
      })
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: error.errors.map(e => e.message).join(', ')
        })
      }
      return res.status(500).json({ success: false, error: 'Erro na validação' })
    }
  }
}