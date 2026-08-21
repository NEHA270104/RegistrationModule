import QRCode from 'qrcode';
import { logger } from '../utils/logger.js';

export interface QRCodeOptions {
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

export class QRCodeService {
  private defaultOptions: QRCodeOptions = {
    width: 200,
    margin: 2,
    color: {
      dark: '#059669', // Brand green color
      light: '#ffffff',
    },
  };

  /**
   * Generate QR code as base64 data URL
   * @param text - The text/URL to encode in the QR code
   * @param options - Optional customization options
   * @returns Base64 data URL of the QR code image
   */
  async generateDataUrl(text: string, options?: QRCodeOptions): Promise<string> {
    try {
      const mergedOptions = {
        ...this.defaultOptions,
        ...options,
        color: {
          ...this.defaultOptions.color,
          ...options?.color,
        },
      };

      const dataUrl = await QRCode.toDataURL(text, {
        width: mergedOptions.width,
        margin: mergedOptions.margin,
        color: mergedOptions.color,
        errorCorrectionLevel: 'M',
      });

      logger.debug('QR code generated', {
        textLength: text.length,
        width: mergedOptions.width,
      });

      return dataUrl;
    } catch (error) {
      logger.error('Error generating QR code', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Generate QR code as PNG buffer
   * @param text - The text/URL to encode in the QR code
   * @param options - Optional customization options
   * @returns PNG buffer of the QR code image
   */
  async generateBuffer(text: string, options?: QRCodeOptions): Promise<Buffer> {
    try {
      const mergedOptions = {
        ...this.defaultOptions,
        ...options,
        color: {
          ...this.defaultOptions.color,
          ...options?.color,
        },
      };

      const buffer = await QRCode.toBuffer(text, {
        type: 'png',
        width: mergedOptions.width,
        margin: mergedOptions.margin,
        color: mergedOptions.color,
        errorCorrectionLevel: 'M',
      });

      return buffer;
    } catch (error) {
      logger.error('Error generating QR code buffer', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Failed to generate QR code buffer');
    }
  }

  /**
   * Generate QR code as SVG string
   * @param text - The text/URL to encode in the QR code
   * @param options - Optional customization options
   * @returns SVG string of the QR code
   */
  async generateSvg(text: string, options?: QRCodeOptions): Promise<string> {
    try {
      const mergedOptions = {
        ...this.defaultOptions,
        ...options,
        color: {
          ...this.defaultOptions.color,
          ...options?.color,
        },
      };

      const svg = await QRCode.toString(text, {
        type: 'svg',
        width: mergedOptions.width,
        margin: mergedOptions.margin,
        color: mergedOptions.color,
        errorCorrectionLevel: 'M',
      });

      return svg;
    } catch (error) {
      logger.error('Error generating QR code SVG', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Failed to generate QR code SVG');
    }
  }
}

export const qrCodeService = new QRCodeService();
