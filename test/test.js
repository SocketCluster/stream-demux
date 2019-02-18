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
      demux.close('hello');
      demux.close('abc');
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
      demux.close('hello');
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

  it('should support iterating over a substream using a while loop', async () => {
    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(10);
        demux.write('hello', 'world' + i);
        demux.write('hello', 'foo' + i);
      }
      demux.close('hello');
    })();

    let receivedPackets = [];
    let consumer = demux.stream('hello').createConsumer();

    assert.equal(consumer.backpressure, 0);

    while (true) {
      let packet = await consumer.next();
      if (packet.done) break;
      receivedPackets.push(packet.value);
    }

    assert.equal(receivedPackets.length, 20);
    assert.equal(receivedPackets[0], 'world0');
    assert.equal(receivedPackets[1], 'foo0');
    assert.equal(receivedPackets[2], 'world1');
    assert.equal(receivedPackets[3], 'foo1');
  });

  it('should support closing all streams using a single closeAll command', async () => {
    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(10);
        demux.write('hello', 'world' + i);
        demux.write('abc', 'def' + i);
      }
      demux.closeAll();
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

  it('should support resuming stream consumption after the stream has been closed', async () => {
    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(10);
        demux.write('hello', 'a' + i);
      }
      demux.close('hello');
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
      demux.close('hello');
    })();

    let receivedPacketsB = [];
    for await (let packet of demux.stream('hello')) {
      receivedPacketsB.push(packet);
    }

    assert.equal(receivedPacketsB.length, 10);
  });

  it('should support resuming stream consumption after the stream has been closed using closeAll', async () => {
    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(10);
        demux.write('hello', 'a' + i);
      }
      demux.closeAll();
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
      demux.closeAll();
    })();

    let receivedPacketsB = [];
    for await (let packet of demux.stream('hello')) {
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
      demux.close('hello');
    })();

    let substream = demux.stream('hello');

    let packet = await substream.once();
    assert.equal(packet, 'world0');

    packet = await substream.once();
    assert.equal(packet, 'world1');

    packet = await substream.once();
    assert.equal(packet, 'world2');
  });

  it('should not resolve stream.once() when stream is closed', async () => {
    (async () => {
      await wait(10);
      demux.close('hello');
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

  it('should support the stream.once() method with timeout', async () => {
    (async () => {
      for (let i = 0; i < 3; i++) {
        await wait(20);
        demux.write('hello', 'world' + i);
      }
      demux.close('hello');
    })();

    let substream = demux.stream('hello');

    let packet = await substream.once(30);
    assert.equal(packet, 'world0');

    let error;
    packet = null;
    try {
      packet = await substream.once(10);
    } catch (err) {
      error = err;
    }
    assert.notEqual(error, null);
    assert.equal(error.name, 'TimeoutError');
    assert.equal(packet, null);
  });

  it('should support stream.next() method with close command', async () => {
    (async () => {
      for (let i = 0; i < 3; i++) {
        await wait(10);
        demux.write('hello', 'world' + i);
      }
      await wait(10);
      demux.close('hello');
    })();

    let substream = demux.stream('hello');

    let packet = await substream.next();
    assert.equal(JSON.stringify(packet), JSON.stringify({value: 'world0', done: false}));

    packet = await substream.next();
    assert.equal(JSON.stringify(packet), JSON.stringify({value: 'world1', done: false}));

    packet = await substream.next();
    assert.equal(JSON.stringify(packet), JSON.stringify({value: 'world2', done: false}));

    packet = await substream.next();
    assert.equal(JSON.stringify(packet), JSON.stringify({value: undefined, done: true}));
  });

  it('should support stream.next() method with closeAll command', async () => {
    (async () => {
      await wait(10);
      demux.write('hello', 'world');
      await wait(10);
      demux.closeAll();
    })();

    let substream = demux.stream('hello');

    let packet = await substream.next();
    assert.equal(JSON.stringify(packet), JSON.stringify({value: 'world', done: false}));

    packet = await substream.next();
    assert.equal(JSON.stringify(packet), JSON.stringify({value: undefined, done: true}));
  });

  it('should support writeToConsumer method', async () => {

  });

  it('should support closeConsumer method', async () => {

  });

  it('should support getConsumerStats method', async () => {

  });

  it('should support getConsumerStatsList method', async () => {

  });

  it('should support getConsumerStatsListAll method', async () => {

  });

  it('should support kill method', async () => {

  });

  it('should support killAll method', async () => {

  });

  it('should support killConsumer method', async () => {

  });

  it('should support getBackpressure method', async () => {

  });

  it('should support getConsumerBackpressure method', async () => {

  });

  it('should support hasConsumer method', async () => {

  });

  describe('DemuxedConsumableStream', () => {
    it('should support writeToConsumer method', async () => {

    });

    it('should support closeConsumer method', async () => {

    });

    it('should support getConsumerStats method', async () => {

    });

    it('should support getConsumerStatsList method', async () => {

    });

    it('should support kill method', async () => {

    });

    it('should support killConsumer method', async () => {

    });

    it('should support getBackpressure method', async () => {

    });

    it('should support getConsumerBackpressure method', async () => {

    });

    it('should support hasConsumer method', async () => {

    });
  });
});
