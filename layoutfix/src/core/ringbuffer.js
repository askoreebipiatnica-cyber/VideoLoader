/**
 * Кольцевой буфер последнего ввода — максимум 64 символа на активное поле.
 * Никакой записи на диск и никаких сетевых операций: только оперативная память,
 * буфер обнуляется при смене поля.
 */
(function (root) {
  'use strict';
  const LF = root.LayoutFix;
  if (LF.RingBuffer) return LF.RingBuffer;

  const MAX = 64;

  /**
   * @constructor
   * @param {number} [capacity=64]
   */
  function RingBuffer(capacity) {
    this.cap = capacity || MAX;
    this.buf = new Array(this.cap);
    this.head = 0; // индекс следующей записи
    this.count = 0;
  }

  RingBuffer.prototype.MAX_CAPACITY = MAX;

  RingBuffer.prototype.push = function (ch) {
    this.buf[this.head] = ch;
    this.head = (this.head + 1) % this.cap;
    if (this.count < this.cap) this.count++;
  };

  /** Удаляет последние n символов (backspace). */
  RingBuffer.prototype.pop = function (n) {
    let removed = 0;
    for (let i = 0; i < (n || 1) && this.count > 0; i++) {
      this.head = (this.head - 1 + this.cap) % this.cap;
      this.buf[this.head] = undefined;
      this.count--;
      removed++;
    }
    return removed;
  };

  /** Последние n символов в порядке набора. */
  RingBuffer.prototype.tail = function (n) {
    const take = Math.min(n || this.count, this.count);
    const out = new Array(take);
    for (let i = 0; i < take; i++) {
      out[take - 1 - i] = this.buf[(this.head - 1 - i + this.cap) % this.cap];
    }
    return out.join('');
  };

  RingBuffer.prototype.clear = function () {
    this.head = 0;
    this.count = 0;
    this.buf.fill(undefined);
  };

  Object.defineProperty(RingBuffer.prototype, 'length', {
    get() { return this.count; }
  });

  /** Извлекает последнее «слово» (по разделителям) из буфера. */
  RingBuffer.prototype.lastWord = function () {
    const text = this.tail();
    const match = /[^\s]*$/.exec(text.replace(/\s$/, ''));
    return match ? match[0] : '';
  };

  return LF.defineModule('RingBuffer', { RingBuffer, MAX });
})(typeof self !== 'undefined' ? self : globalThis);
