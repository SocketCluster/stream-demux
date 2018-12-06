const AsyncIterableStream = require('async-iterable-stream');
const WritableAsyncIterableStream = require('writable-async-iterable-stream');

class StreamDemux {
  constructor() {
    this._mainStream = new WritableAsyncIterableStream();
  }

  _write(name, value, done) {
    this._mainStream.write({
      name,
      data: {value, done}
    });
  }

  write(name, value) {
    this._write(name, value, false);
  }

  end(name) {
    this._write(name, undefined, true);
  }

  endAll() {
    this._mainStream.end();
  }

  async _next(name, mainAsyncIterator) {
    while (true) {
      let packet = await mainAsyncIterator.next();
      if (packet.done) {
        return packet;
      }
      if (packet.value.name === name) {
        return packet.value.data;
      }
    }
  }

  next(name) {
    return this._next(name, this._mainStream);
  }

  createAsyncIterator(name) {
    let mainStreamIterator = this._mainStream.createAsyncIterator();
    return {
      next: async () => {
        return this._next(name, mainStreamIterator);
      }
    }
  }

  stream(name) {
    return new DemuxedAsyncIterableStream(this, name);
  }
}

class DemuxedAsyncIterableStream extends AsyncIterableStream {
  constructor(streamDemux, name) {
    super();
    this.name = name;
    this._streamDemux = streamDemux;
  }

  next() {
    return this._streamDemux.next(this.name);
  }

  createAsyncIterator() {
    return this._streamDemux.createAsyncIterator(this.name);
  }
}

module.exports = StreamDemux;
