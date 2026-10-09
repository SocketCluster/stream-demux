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

    assert.equal(consumer.getBackpressure(), 0);

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

  it('should support writing multiple times within the same call stack and across multiple streams', async () => {
    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(20);
        for (let j = 0; j < 10; j++) {
          demux.write('hello', 'world' + i + '-' + j);
        }
      }
      demux.close('hello');
    })();

    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(10);
        for (let j = 0; j < 5; j++) {
          demux.write('other', 'message' + i + '-' + j);
        }
      }
      demux.close('other');
    })();

    let substream = demux.stream('hello');
    let otherSubstream = demux.stream('other');

    let otherReceivedPackets = [];
    (async () => {
      for await (let otherPacket of otherSubstream) {
        await wait(10);
        otherReceivedPackets.push(otherPacket);
      }
    })();

    (async () => {
      for await (let otherPacket of otherSubstream) {
        await wait(20);
        otherReceivedPackets.push(otherPacket);
      }
    })();

    let receivedPackets = [];
    for await (let packet of substream) {
      await wait(20);
      receivedPackets.push(packet);
    }

    assert.equal(receivedPackets.length, 100);
    assert.equal(otherReceivedPackets.length, 100);
  });

  it('should support writing an arbitrarily large number of times within the same call stack', async () => {
    (async () => {
      await wait(50);
      for (let i = 0; i < 100; i++) {
        demux.write('hello', 'world' + i);
      }
      demux.close('hello');
    })();

    let substream = demux.stream('hello');

    let receivedPackets = [];
    for await (let packet of substream) {
      receivedPackets.push(packet);
      await wait(10);
    }

    assert.equal(receivedPackets.length, 100);
  });

  it('should support writing an arbitrarily large number of times within the same call stack with multiple concurrent consumers', async () => {
    (async () => {
      await wait(50);
      for (let i = 0; i < 50; i++) {
        demux.write('other', 'message' + i);
      }
      demux.close('other');
    })();

    let otherSubstream = demux.stream('other');

    let receivedPackets = [];
    (async () => {
      for await (let otherPacket of otherSubstream) {
        await wait(10);
        receivedPackets.push(otherPacket);
      }
    })();

    for await (let otherPacket of otherSubstream) {
      await wait(20);
      receivedPackets.push(otherPacket);
    }

    assert.equal(receivedPackets.length, 100);
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

    await wait(1);

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

  it('should prevent stream.once() timeout from being reset when writing to other streams', async () => {
    (async () => {
      for (let i = 0; i < 15; i++) {
        await wait(20);
        demux.write('hi', 'test');
      }
    })();

    let substream = demux.stream('hello');

    let packet;
    let error;
    try {
      packet = await substream.once(200);
    } catch (err) {
      error = err;
    }

    assert.notEqual(error, null);
    assert.equal(error.name, 'TimeoutError');
    assert.equal(packet, null);
  });

  it('should prevent stream timeout from being reset when writing to other streams when iterating over consumer with timeout', async () => {
    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(200);
        demux.write('foo', 123);
        await wait(200);
        demux.write('hello', 'test' + i);
      }
      demux.kill('hello');
    })();

    let consumer = demux.stream('hello').createConsumer(300);
    let error;

    let packet;

    try {
      while (true) {
        packet = await consumer.next();
        if (packet.done) break;
      }
    } catch (err) {
      error = err;
    }

    assert.notEqual(error, null);
    assert.equal(error.name, 'TimeoutError');
    assert.equal(packet, null);
  });

  it('should prevent stream.once() timeout from being reset when killing other streams', async () => {
    (async () => {
      for (let i = 0; i < 15; i++) {
        await wait(20);
        demux.kill('hi' + i, 'test');
      }
    })();

    let substream = demux.stream('hello');

    let packet;
    let error;
    try {
      packet = await substream.once(200);
    } catch (err) {
      error = err;
    }

    assert.notEqual(error, null);
    assert.equal(error.name, 'TimeoutError');
    assert.equal(packet, null);
  });

  it('should support stream.once() timeout after killing the stream', async () => {
    (async () => {
      await wait(20);
      demux.kill('hello', 'test');
    })();

    let substream = demux.stream('hello');

    let start = Date.now();

    let packet;
    let error;
    try {
      packet = await substream.once(200);
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
    let receivedPackets = [];
    let consumer = demux.stream('hello').createConsumer();

    (async () => {
      await wait(50);
      for (let i = 0; i < 10; i++) {
        await wait(10);
        demux.writeToConsumer(consumer.id, 'world' + i);
      }
      // Writing to a non-existent consumer should be ignored.
      demux.writeToConsumer(123, 'foo');
      demux.close('hello', 'hi');
    })();

    while (true) {
      let packet = await consumer.next();
      receivedPackets.push(packet.value);
      if (packet.done) break;
    }

    assert.equal(receivedPackets.length, 11);
    assert.equal(receivedPackets[0], 'world0');
    assert.equal(receivedPackets[1], 'world1');
    assert.equal(receivedPackets[9], 'world9');
    assert.equal(receivedPackets[10], 'hi');
  });

  it('should support closeConsumer method', async () => {
    let receivedPackets = [];
    let consumer = demux.stream('hello').createConsumer();

    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(10);
        demux.write('hello', 'world' + i);
      }
      demux.closeConsumer(consumer.id, 'hi');

      // Closing a non-existent consumer should be ignored.
      demux.closeConsumer(123, 'bar');
    })();

    while (true) {
      let packet = await consumer.next();
      receivedPackets.push(packet.value);
      if (packet.done) break;
    }

    assert.equal(receivedPackets.length, 11);
    assert.equal(receivedPackets[0], 'world0');
    assert.equal(receivedPackets[1], 'world1');
    assert.equal(receivedPackets[9], 'world9');
    assert.equal(receivedPackets[10], 'hi');
  });

  it('should support getConsumerStats method', async () => {
    let consumer = demux.stream('hello').createConsumer();

    for (let i = 0; i < 10; i++) {
      demux.write('hello', 'world' + i);
    }
    demux.close('hello', 'hi');

    let consumerStats = demux.getConsumerStats(consumer.id);
    assert.notEqual(consumerStats, null);
    assert.equal(consumerStats.id, consumer.id);
    assert.equal(consumerStats.backpressure, 11);
    assert.equal(consumerStats.backpressure, consumer.getBackpressure());

    consumer.return();

    consumerStats = demux.getConsumerStats(consumer.id);
    assert.equal(consumerStats, undefined);
  });

  it('should support getConsumerStatsList method', async () => {
    let consumerA = demux.stream('hello').createConsumer();

    for (let i = 0; i < 10; i++) {
      demux.write('hello', 'world' + i);
    }

    let consumerB = demux.stream('hello').createConsumer();

    demux.write('hello', 123);
    demux.close('hello', 'hi');

    let consumerStatsList = demux.getConsumerStatsList('hello');
    assert.equal(consumerStatsList.length, 2);
    assert.equal(consumerStatsList[0].id, consumerA.id);
    assert.equal(consumerStatsList[0].backpressure, 12);
    assert.equal(consumerStatsList[0].backpressure, consumerA.getBackpressure());
    assert.equal(consumerStatsList[1].id, consumerB.id);
    assert.equal(consumerStatsList[1].backpressure, 2);
    assert.equal(consumerStatsList[1].backpressure, consumerB.getBackpressure());

    consumerStatsList = demux.getConsumerStatsList('bar');
    assert.equal(consumerStatsList.length, 0);

    consumerA.return();
    consumerB.return();
  });

  it('should support getConsumerStatsListAll method', async () => {
    let consumerA = demux.stream('hello').createConsumer();

    for (let i = 0; i < 10; i++) {
      demux.write('hello', 'world' + i);
    }

    let consumerB = demux.stream('hello').createConsumer();
    let consumerC = demux.stream('foo').createConsumer();

    demux.write('hello', 123);
    demux.close('hello', 'hi');

    let consumerStatsList = demux.getConsumerStatsListAll();
    assert.equal(consumerStatsList.length, 3);
    assert.equal(consumerStatsList[0].id, consumerA.id);
    assert.equal(consumerStatsList[0].backpressure, 12);
    assert.equal(consumerStatsList[0].backpressure, consumerA.getBackpressure());
    assert.equal(consumerStatsList[1].id, consumerB.id);
    assert.equal(consumerStatsList[1].backpressure, 2);
    assert.equal(consumerStatsList[1].backpressure, consumerB.getBackpressure());
    assert.equal(consumerStatsList[2].id, consumerC.id);
    assert.equal(consumerStatsList[2].backpressure, 0);
    assert.equal(consumerStatsList[2].backpressure, consumerC.getBackpressure());

    consumerA.return();
    consumerB.return();
    consumerC.return();

    consumerStatsList = demux.getConsumerStatsListAll();
    assert.equal(consumerStatsList.length, 0);
  });

  it('should support kill method', async () => {
    let consumerA = demux.stream('hello').createConsumer();
    let consumerB = demux.stream('hello').createConsumer();

    for (let i = 0; i < 10; i++) {
      demux.write('hello', 'world' + i);
    }

    let receivedPackets = [];

    (async () => {
      while (true) {
        let packet = await consumerA.next();
        receivedPackets.push(packet);
        if (packet.done) break;
        await wait(30);
      }
    })();

    await wait(80);

    demux.kill('hello', 'end');

    await wait(50);

    assert.equal(receivedPackets.length, 4);
    assert.equal(receivedPackets[0].value, 'world0');
    assert.equal(receivedPackets[1].value, 'world1');
    assert.equal(receivedPackets[2].value, 'world2');
    assert.equal(receivedPackets[3].done, true);
    assert.equal(receivedPackets[3].value, 'end');
    assert.equal(consumerA.getBackpressure(), 0);
    assert.equal(consumerB.getBackpressure(), 0);
  });

  it('should support killAll method', async () => {
    let consumerA = demux.stream('hello').createConsumer();
    let consumerB = demux.stream('hello').createConsumer();
    let consumerC = demux.stream('hi').createConsumer();

    for (let i = 0; i < 10; i++) {
      demux.write('hello', 'world' + i);
      demux.write('hi', 'world' + i);
    }

    let receivedPacketsA = [];
    let receivedPacketsC = [];

    (async () => {
      while (true) {
        let packet = await consumerA.next();
        receivedPacketsA.push(packet);
        if (packet.done) break;
        await wait(30);
      }
    })();
    (async () => {
      while (true) {
        let packet = await consumerC.next();
        receivedPacketsC.push(packet);
        if (packet.done) break;
        await wait(30);
      }
    })();

    await wait(80);
    demux.killAll('bar');
    await wait(50);

    assert.equal(receivedPacketsA.length, 4);
    assert.equal(receivedPacketsA[0].value, 'world0');
    assert.equal(receivedPacketsA[1].value, 'world1');
    assert.equal(receivedPacketsA[2].value, 'world2');
    assert.equal(receivedPacketsA[3].done, true);
    assert.equal(receivedPacketsA[3].value, 'bar');
    assert.equal(receivedPacketsC.length, 4);
    assert.equal(receivedPacketsC[0].value, 'world0');
    assert.equal(receivedPacketsC[1].value, 'world1');
    assert.equal(receivedPacketsC[2].value, 'world2');
    assert.equal(receivedPacketsC[3].done, true);
    assert.equal(receivedPacketsC[3].value, 'bar');
    assert.equal(consumerA.getBackpressure(), 0);
    assert.equal(consumerB.getBackpressure(), 0);
  });

  it('should support killConsumer method', async () => {
    let consumerA = demux.stream('hello').createConsumer();
    let consumerB = demux.stream('hello').createConsumer();

    for (let i = 0; i < 10; i++) {
      demux.write('hello', 'world' + i);
    }

    let receivedPacketsA = [];
    let receivedPacketsB = [];

    (async () => {
      while (true) {
        let packet = await consumerA.next();
        receivedPacketsA.push(packet);
        if (packet.done) break;
        await wait(30);
      }
    })();

    (async () => {
      while (true) {
        let packet = await consumerB.next();
        receivedPacketsB.push(packet);
        if (packet.done) break;
        await wait(30);
      }
    })();

    await wait(80);

    demux.killConsumer(consumerA.id, 'the end');

    await wait(350);

    assert.equal(receivedPacketsA.length, 4);
    assert.equal(receivedPacketsA[0].value, 'world0');
    assert.equal(receivedPacketsA[1].value, 'world1');
    assert.equal(receivedPacketsA[2].value, 'world2');
    assert.equal(receivedPacketsA[3].done, true);
    assert.equal(receivedPacketsA[3].value, 'the end');

    assert.equal(receivedPacketsB.length, 10);
    assert.equal(receivedPacketsB[0].value, 'world0');
    assert.equal(receivedPacketsB[1].value, 'world1');
    assert.equal(receivedPacketsB[9].value, 'world9');

    assert.equal(consumerA.getBackpressure(), 0);
    assert.equal(consumerB.getBackpressure(), 0);
  });

  it('should support getBackpressure method', async () => {
    let consumer = demux.stream('hello').createConsumer();

    demux.write('hello', 'world0');
    demux.write('hello', 'world1');

    assert.equal(demux.getBackpressure('hello'), 2);

    demux.write('hello', 'world2');
    demux.write('hello', 'world3');

    assert.equal(demux.getBackpressure('hello'), 4);

    demux.kill('hello');

    assert.equal(demux.getBackpressure('hello'), 0);
  });

  it('should support getBackpressureAll method', async () => {
    let consumerA = demux.stream('hello').createConsumer();
    let consumerB = demux.stream('hi').createConsumer();

    demux.write('hello', 'world0');
    demux.write('hello', 'world1');

    assert.equal(demux.getBackpressureAll(), 2);

    demux.write('hi', 'message');
    demux.write('hi', 'message');
    demux.write('hi', 'message');
    demux.write('hi', 'message');

    assert.equal(demux.getBackpressureAll(), 4);

    demux.kill('hi');

    assert.equal(demux.getBackpressureAll(), 2);

    demux.kill('hello');

    assert.equal(demux.getBackpressureAll(), 0);
  });

  it('should support getConsumerBackpressure method', async () => {
    let consumerA = demux.stream('hello').createConsumer();
    let consumerB = demux.stream('hi').createConsumer();

    demux.write('hello', 'world0');
    demux.write('hello', 'world1');

    demux.write('hi', 'message');
    demux.write('hi', 'message');
    demux.write('hi', 'message');
    demux.write('hi', 'message');

    assert.equal(demux.getConsumerBackpressure(consumerA.id), 2);
    assert.equal(demux.getConsumerBackpressure(consumerB.id), 4);

    demux.kill('hi');

    assert.equal(demux.getConsumerBackpressure(consumerA.id), 2);
    assert.equal(demux.getConsumerBackpressure(consumerB.id), 0);

    demux.kill('hello');

    assert.equal(demux.getConsumerBackpressure(consumerA.id), 0);
    assert.equal(demux.getConsumerBackpressure(consumerB.id), 0);
  });

  it('should support hasConsumer method', async () => {
    let consumerA = demux.stream('hello').createConsumer();
    let consumerB = demux.stream('hi').createConsumer();

    assert.equal(demux.hasConsumer('hello', 123), false);
    assert.equal(demux.hasConsumer('hello', consumerA.id), true);
    assert.equal(demux.hasConsumer('hi', consumerB.id), true);
    assert.equal(demux.hasConsumer('hello', consumerB.id), false);
    assert.equal(demux.hasConsumer('hi', consumerA.id), false);
  });

  it('should support hasConsumerAll method', async () => {
    let consumerA = demux.stream('hello').createConsumer();
    let consumerB = demux.stream('hi').createConsumer();

    assert.equal(demux.hasConsumerAll(123), false);
    assert.equal(demux.hasConsumerAll(consumerA.id), true);
    assert.equal(demux.hasConsumerAll(consumerB.id), true);
  });

  it('should not attribute packets addressed to one consumer to the other consumers of the same stream', async () => {
    let consumerA = demux.stream('hello').createConsumer();
    let consumerB = demux.stream('hello').createConsumer();

    for (let i = 0; i < 10; i++) {
      demux.writeToConsumer(consumerA.id, 'for-a' + i);
    }

    assert.equal(demux.getConsumerBackpressure(consumerA.id), 10);
    assert.equal(demux.getConsumerBackpressure(consumerB.id), 0);
    assert.equal(demux.getBackpressure('hello'), 10);
    assert.equal(demux.getBackpressureAll(), 10);
  });

  it('should attribute broadcast packets to every consumer of the stream', async () => {
    let consumerA = demux.stream('hello').createConsumer();
    let consumerB = demux.stream('hello').createConsumer();

    demux.write('hello', 'one');
    demux.writeToConsumer(consumerA.id, 'for-a');
    demux.write('hello', 'two');

    assert.equal(demux.getConsumerBackpressure(consumerA.id), 3);
    assert.equal(demux.getConsumerBackpressure(consumerB.id), 2);
  });

  it('should not reset a consumer timeout when a packet is addressed to a different consumer of the same stream', async () => {
    let victim = demux.stream('hello').createConsumer(100);
    let other = demux.stream('hello').createConsumer();

    let error;
    let consumeVictim = (async () => {
      try {
        for await (let packet of victim) {}
      } catch (err) {
        error = err;
      }
    })();

    let spam = (async () => {
      for (let i = 0; i < 15; i++) {
        demux.writeToConsumer(other.id, 'spam' + i);
        await wait(20);
      }
    })();

    await Promise.all([consumeVictim, spam]);

    assert.notEqual(error, null);
    assert.equal(error.name, 'TimeoutError');
  });

  it('should deliver targeted packets only to the consumer they were addressed to', async () => {
    let consumerA = demux.stream('hello').createConsumer();
    let consumerB = demux.stream('hello').createConsumer();

    let receivedA = [];
    let receivedB = [];

    let consumeA = (async () => {
      while (true) {
        let packet = await consumerA.next();
        if (packet.done) break;
        receivedA.push(packet.value);
      }
    })();
    let consumeB = (async () => {
      while (true) {
        let packet = await consumerB.next();
        if (packet.done) break;
        receivedB.push(packet.value);
      }
    })();

    await wait(10);

    demux.writeToConsumer(consumerA.id, 'secret-a');
    demux.write('hello', 'public');
    demux.writeToConsumer(consumerB.id, 'secret-b');
    demux.close('hello');

    await Promise.all([consumeA, consumeB]);

    assert.equal(JSON.stringify(receivedA), JSON.stringify(['secret-a', 'public']));
    assert.equal(JSON.stringify(receivedB), JSON.stringify(['public', 'secret-b']));
  });

  it('should report queue depth separately from backpressure', async () => {
    let idle = demux.stream('hello').createConsumer();
    let active = demux.stream('hello').createConsumer();

    let consumeActive = (async () => {
      for await (let packet of active) {}
    })();

    await wait(10);

    for (let i = 0; i < 10; i++) {
      demux.writeToConsumer(active.id, 'for-active' + i);
    }

    assert.equal(demux.getConsumerBackpressure(idle.id), 0);
    assert.equal(demux.getConsumerQueueDepth(idle.id), 10);
    assert.equal(demux.getQueueDepth('hello'), 10);
    assert.equal(demux.getQueueDepthAll(), 10);

    await wait(50);

    // The active consumer has caught up, so its own backpressure is zero, but
    // the 10 items are still unprocessed by the idle consumer, so the stream
    // still reports them as pending work.
    assert.equal(demux.getConsumerBackpressure(active.id), 0);
    assert.equal(demux.getBackpressureAll(), 10);
    assert.equal(demux.getQueueDepthAll(), 10);

    demux.close('hello');
    await consumeActive;
  });

  it('should report zero queue depth for unknown streams and consumers', async () => {
    assert.equal(demux.getQueueDepth('does-not-exist'), 0);
    assert.equal(demux.getQueueDepthAll(), 0);
    assert.equal(demux.getConsumerQueueDepth(12345), 0);
  });

  it('should drop back to zero queue depth once every consumer has caught up', async () => {
    let consumerA = demux.stream('hello').createConsumer();
    let consumerB = demux.stream('hello').createConsumer();

    let consumeA = (async () => {
      for await (let packet of consumerA) {}
    })();
    let consumeB = (async () => {
      for await (let packet of consumerB) {}
    })();

    await wait(10);

    for (let i = 0; i < 10; i++) {
      demux.write('hello', 'hello' + i);
    }

    await wait(50);

    assert.equal(demux.getQueueDepthAll(), 0);

    demux.close('hello');
    await Promise.all([consumeA, consumeB]);
  });

  it('should end a consuming loop when return() is called in the same tick as a write', async () => {
    let consumer = demux.stream('hello').createConsumer();

    let error;
    let ended = false;
    let consume = (async () => {
      try {
        for await (let packet of consumer) {}
        ended = true;
      } catch (err) {
        error = err;
      }
    })();

    await wait(10);

    // The write resolves the parked next() call; the return() which follows in
    // the same tick used to leave that call with no packet to terminate on and
    // no currentNode to read, throwing a TypeError out of the consuming loop.
    demux.write('hello', 'packet');
    consumer.return();

    await consume;

    assert.equal(error, undefined);
    assert.equal(ended, true);
    assert.equal(demux.getConsumerCountAll(), 0);
  });

  it('should end a consuming loop when return() is called in the same tick as a targeted write', async () => {
    let consumer = demux.stream('hello').createConsumer();

    let error;
    let ended = false;
    let consume = (async () => {
      try {
        for await (let packet of consumer) {}
        ended = true;
      } catch (err) {
        error = err;
      }
    })();

    await wait(10);

    demux.writeToConsumer(consumer.id, 'packet');
    consumer.return();

    await consume;

    assert.equal(error, undefined);
    assert.equal(ended, true);
  });

  it('should end a consuming loop when return() is called in the same tick as a close', async () => {
    let consumer = demux.stream('hello').createConsumer();

    let error;
    let ended = false;
    let consume = (async () => {
      try {
        for await (let packet of consumer) {}
        ended = true;
      } catch (err) {
        error = err;
      }
    })();

    await wait(10);

    demux.close('hello', 'end');
    consumer.return();

    await consume;

    assert.equal(error, undefined);
    assert.equal(ended, true);
  });

  it('should reclaim the stream after return() races a write', async () => {
    let consumer = demux.stream('hello').createConsumer();

    let consume = (async () => {
      for await (let packet of consumer) {}
    })();

    await wait(10);

    demux.write('hello', 'packet');
    consumer.return();

    await consume;

    assert.equal(demux.getConsumerCount('hello'), 0);
    assert.equal(demux.hasConsumerAll(consumer.id), false);
    assert.equal(Object.keys(demux.streams).length, 0);
  });
});
