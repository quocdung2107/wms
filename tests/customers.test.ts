import { test } from 'node:test'
import assert from 'node:assert/strict'
import { customerKey, customerLabel, normalizeCustomer, validateCustomer } from '../src/shared/inventory/customers.ts'

test('normalizeCustomer: trim, thiếu trường thành chuỗi rỗng', () => {
  const c = normalizeCustomer({ code: ' KH1 ', name: ' A ' })
  assert.equal(c.code, 'KH1')
  assert.equal(c.name, 'A')
  assert.equal(c.phone2, '')
})

test('validateCustomer: bắt buộc mã và tên', () => {
  assert.match(validateCustomer(normalizeCustomer({ name: 'A' }), []) ?? '', /Mã KH/)
  assert.match(validateCustomer(normalizeCustomer({ code: 'K' }), []) ?? '', /Tên/)
  assert.equal(validateCustomer(normalizeCustomer({ code: 'K', name: 'A' }), []), null)
})

test('validateCustomer: trùng mã (không phân biệt hoa thường) bị từ chối', () => {
  const c = normalizeCustomer({ code: 'kh1 ', name: 'A' })
  assert.match(validateCustomer(c, ['KH1']) ?? '', /đã tồn tại/)
  assert.equal(customerKey('kh1 '), 'KH1')
})

test('customerLabel: hiện tên, thiếu khách thì hiện mã, rỗng thì rỗng', () => {
  const list = [normalizeCustomer({ code: 'KH1', name: 'Công ty A' })]
  assert.equal(customerLabel('kh1', list), 'Công ty A')
  assert.equal(customerLabel('KH9', list), 'KH9')
  assert.equal(customerLabel(null, list), '')
})
