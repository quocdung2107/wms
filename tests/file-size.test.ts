import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_FILE_BYTES, assertFileSize, readWorkbook } from '../src/shared/excel/reader.ts'

test('MAX_FILE_BYTES = 20 MB', () => {
  assert.equal(MAX_FILE_BYTES, 20971520)
})

test('assertFileSize: 0 byte, nhỏ và đúng 20 MB đều qua', () => {
  assert.doesNotThrow(() => assertFileSize(0))
  assert.doesNotThrow(() => assertFileSize(1024))
  assert.doesNotThrow(() => assertFileSize(MAX_FILE_BYTES))
})

test('assertFileSize: 20 MB + 1 byte ném lỗi', () => {
  assert.throws(() => assertFileSize(MAX_FILE_BYTES + 1), /vượt giới hạn 20 MB/)
})

test('assertFileSize: thông báo nêu dung lượng (dấu phẩy) và giới hạn', () => {
  assert.throws(
    () => assertFileSize(Math.round(25.3 * 1048576)),
    { message: 'File 25,3 MB vượt giới hạn 20 MB. Hãy tách nhỏ file rồi nạp lại.' },
  )
})

test('readWorkbook: Uint8Array > 20 MB ném lỗi', () => {
  assert.throws(() => readWorkbook(new Uint8Array(MAX_FILE_BYTES + 1)), /vượt giới hạn 20 MB/)
})
