const assert = require('assert');
const StreamDemux = require('../index');
const IterableAsyncStream = require('iterable-async-stream');

function wait(duration) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, duration);
  });
}

describe('StreamDemux', () => {
  let stream;
  let demux;

  beforeEach(async () => {
    stream = new IterableAsyncStream();
    demux = new StreamDemux(stream);
  });

  it('should multiplex over a single stream and demultiplex over multiple substreams', async () => {
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
        let substream = demux.getStream('hello');
        for await (let packet of substream) {
          receivedHelloPackets.push(packet);
        }
      })(),
      (async () => {
        let substream = demux.getStream('abc');
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
});
