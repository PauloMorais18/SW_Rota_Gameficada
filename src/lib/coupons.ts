export function couponAvailability(coupon: { ativo: boolean; expiresAt: Date; limite: number }, used: number, alreadyUsed: boolean, now = new Date()) {
 if (!coupon.ativo || coupon.expiresAt <= now) return 'Cupom inválido, desativado ou expirado.';
 if (alreadyUsed) return 'Você já utilizou este cupom.';
 if (used >= coupon.limite) return 'O limite de usos deste cupom foi atingido.';
 return null;
}
