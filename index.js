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

  close(name) {
    this._write(name, undefined, true);
  }

  closeAll() {
    this._mainStream.close();
  }

  createAsyncIterator(name, timeout) {
    let mainStreamIterator = this._mainStream.createAsyncIterator(timeout);
    return {
      next: async () => {
        while (true) {
          let packet = await mainStreamIterator.next();
          if (packet.done) {
            return packet;
          }
          if (packet.value.name === name) {
            return packet.value.data;
          }
        }
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

  createAsyncIterator(timeout) {
    return this._streamDemux.createAsyncIterator(this.name, timeout);
  }
}

module.exports = StreamDemux;
