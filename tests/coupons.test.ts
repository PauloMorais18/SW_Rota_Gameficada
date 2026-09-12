import { test } from 'node:test';
import assert from 'node:assert/strict';
import { couponAvailability } from '../src/lib/coupons';
test('coupons reject expired, disabled, repeated and exhausted redemptions', () => {
 const now = new Date('2026-09-14T12:00:00Z');
 const coupon = { ativo: true, expiresAt: new Date(now.getTime() + 1000), limite: 2 };
 assert.equal(couponAvailability(coupon, 1, false, now), null);
 assert.match(couponAvailability(coupon, 2, false, now)!, /limite/);
 assert.match(couponAvailability(coupon, 1, true, now)!, /já utilizou/);
 assert.match(couponAvailability({ ...coupon, ativo: false }, 0, false, now)!, /desativado/);
 assert.match(couponAvailability({ ...coupon, expiresAt: now }, 0, false, now)!, /expirado/);
});
