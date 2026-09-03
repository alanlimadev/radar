/**
 * Utilitário para geração de PINs curtos para salas em rede local.
 */
export class PinUtil {
  /**
   * Gera um PIN numérico de N dígitos (padrão: 6 dígitos).
   */
  static generateNumericPin(digits: number = 6): string {
    const min = Math.pow(10, digits - 1);
    const max = Math.pow(10, digits) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
  }

  /**
   * Gera um PIN alfanumérico legível (ex: 4 caracteres sem caracteres confusos como O/0, I/1).
   */
  static generateReadablePin(length: number = 4): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
