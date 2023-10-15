import { batchByProp } from './highland-batch-by';
import * as highland from 'highland'

describe('batchByProp', () => {
  it('should work', async () => {
    const x = await highland([
       {sku:'a', order_id:1},
       {sku:'b', order_id:1},
       {sku:'c', order_id:2}
    ])
    .through(batchByProp('order_id'))
    .collect()
    .toPromise(Promise)
    expect(x).toMatchSnapshot('output')
  });
});
