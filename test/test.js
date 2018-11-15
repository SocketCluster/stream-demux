const StreamDemux = require('../index');
const IterableAsyncStream = require('iterable-async-stream');

function wait(duration) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, duration);
  });
}

describe('StreamDemux tests', () => {
  let stream;
  let demux;

  beforeEach(async () => {
    stream = new IterableAsyncStream();
    demux = new StreamDemux(stream);
  });

  it('Should work', async () => {
    (async () => {
      for (let i = 0; i < 10; i++) {
        await wait(10);
        demux.write('hello', 'world' + i);
        demux.write('abc', 'def' + i);
      }
      demux.end('hello');
    })();

    let substream = demux.getStream('hello');
    for await (let data of substream) {
      console.log('DATA:', data);
    }
  });
});
