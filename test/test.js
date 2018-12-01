const assert = require('assert');
const StreamDemux = require('../index');

let pendingTimeoutSet = new Set();

function wait(duration) {
  return new Promise((resolve) => {
    let timeout = setTimeout(() => {
      pendingTimeoutSet.clear(timeout);
      resolve();
    }, duration);
    pendingTimeoutSet.add(timeout);
  });
}

function cancelAllPendingWaits() {
  for (let timeout of pendingTimeoutSet) {
    clearTimeout(timeout);
  }
}

describe('StreamDemux', () => {
  let demux;

  beforeEach(async () => {
    demux = new StreamDemux();
  });

  afterEach(async () => {
    cancelAllPendingWaits();
  });

  it('should demultiplex packets over multiple substreams', async () => {
    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(10);
        demux.write('hello', 'world' + i);
        demux.write('abc', 'def' + i);
      }
      demux.end('hello');
      demux.end('abc');
    })();

    let receivedHelloPackets = [];
    let receivedAbcPackets = [];

    await Promise.all([
      (async () => {
        let substream = demux.stream('hello');
        for await (let packet of substream) {
          receivedHelloPackets.push(packet);
        }
      })(),
      (async () => {
        let substream = demux.stream('abc');
        for await (let packet of substream) {
          receivedAbcPackets.push(packet);
        }
      })()
    ]);

    assert.equal(receivedHelloPackets.length, 10);
    assert.equal(receivedHelloPackets[0], 'world0');
    assert.equal(receivedHelloPackets[1], 'world1');
    assert.equal(receivedHelloPackets[9], 'world9');

    assert.equal(receivedAbcPackets.length, 10);
    assert.equal(receivedAbcPackets[0], 'def0');
    assert.equal(receivedAbcPackets[1], 'def1');
    assert.equal(receivedAbcPackets[9], 'def9');
  });

  it('should support iterating over a single substream from multiple consumers at the same time', async () => {
    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(10);
        demux.write('hello', 'world' + i);
      }
      demux.end('hello');
    })();

    let receivedPacketsA = [];
    let receivedPacketsB = [];
    let receivedPacketsC = [];
    let substream = demux.stream('hello');

    await Promise.all([
      (async () => {
        for await (let packet of substream) {
          receivedPacketsA.push(packet);
        }
      })(),
      (async () => {
        for await (let packet of substream) {
          receivedPacketsB.push(packet);
        }
      })(),
      (async () => {
        for await (let packet of substream) {
          receivedPacketsC.push(packet);
        }
      })()
    ]);

    assert.equal(receivedPacketsA.length, 10);
    assert.equal(receivedPacketsB.length, 10);
    assert.equal(receivedPacketsC.length, 10);
  });

  it('should support ending all streams using a single endAll command', async () => {
    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(10);
        demux.write('hello', 'world' + i);
        demux.write('abc', 'def' + i);
      }
      demux.endAll();
    })();

    let receivedHelloPackets = [];
    let receivedAbcPackets = [];

    await Promise.all([
      (async () => {
        let substream = demux.stream('hello');
        for await (let packet of substream) {
          receivedHelloPackets.push(packet);
        }
      })(),
      (async () => {
        let substream = demux.stream('abc');
        for await (let packet of substream) {
          receivedAbcPackets.push(packet);
        }
      })()
    ]);

    assert.equal(receivedHelloPackets.length, 10);
    assert.equal(receivedAbcPackets.length, 10);
  });

  it('should support resuming stream consumption after the stream has been ended', async () => {
    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(10);
        demux.write('hello', 'a' + i);
      }
      demux.endAll();
    })();

    let receivedPacketsA = [];
    for await (let packet of demux.stream('hello')) {
      receivedPacketsA.push(packet);
    }

    assert.equal(receivedPacketsA.length, 10);

    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(10);
        demux.write('hello', 'b' + i);
      }
      demux.endAll();
    })();

    let receivedPacketsB = [];
    for await (let packet of demux.stream('hello')) {
      receivedPacketsB.push(packet);
    }

    assert.equal(receivedPacketsB.length, 10);
  });

  it('should support resuming stream consumption published within the same stack frame after the stream has been ended', async () => {
    for (let i = 0; i < 10; i++) {
      demux.write('foo', 'a' + i);
    }
    demux.end('foo');

    let receivedPacketsA = [];
    for await (let packet of demux.stream('foo')) {
      receivedPacketsA.push(packet);
    }

    assert.equal(receivedPacketsA.length, 10);

    for (let i = 0; i < 10; i++) {
      demux.write('foo', 'b' + i);
    }
    demux.end('foo');

    let receivedPacketsB = [];
    for await (let packet of demux.stream('foo')) {
      receivedPacketsB.push(packet);
    }

    assert.equal(receivedPacketsB.length, 10);
  });

  it('should support resuming stream consumption published within the same stack frame after the stream has been ended using endAll', async () => {
    for (let i = 0; i < 10; i++) {
      demux.write('foo', 'a' + i);
    }
    demux.endAll();

    let receivedPacketsA = [];
    for await (let packet of demux.stream('foo')) {
      receivedPacketsA.push(packet);
    }

    assert.equal(receivedPacketsA.length, 10);

    for (let i = 0; i < 10; i++) {
      demux.write('foo', 'b' + i);
    }
    demux.endAll();

    let receivedPacketsB = [];
    for await (let packet of demux.stream('foo')) {
      receivedPacketsB.push(packet);
    }

    assert.equal(receivedPacketsB.length, 10);
  });

  it('should support the stream.once() method', async () => {
    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(10);
        demux.write('hello', 'world' + i);
      }
      demux.end('hello');
    })();

    let substream = demux.stream('hello');

    let packet = await substream.once();
    assert.equal(packet, 'world0');

    packet = await substream.once();
    assert.equal(packet, 'world1');

    packet = await substream.once();
    assert.equal(packet, 'world2');
  });

  it('should not resolve stream.once() when stream is ended', async () => {
    (async () => {
      await wait(10);
      demux.end('hello');
    })();

    let substream = demux.stream('hello');
    let receivedPackets = [];

    (async () => {
      let packet = await substream.once();
      receivedPackets.push(packet);
    })();

    await wait(100);
    assert.equal(receivedPackets.length, 0);
  });
});
