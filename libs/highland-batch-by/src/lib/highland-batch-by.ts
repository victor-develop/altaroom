import * as highland from 'highland'

export interface Control<TBatch, TEntry, TPushedBatch> {
  beginWith: () => TBatch;
  forEachEntry: (b: TBatch, e: TEntry) => { batch_to_update: TBatch; batch_to_push: TPushedBatch | null };
  end: (last_batch: TBatch) => { batch_to_push: TPushedBatch | null };
}

export function batchBy<TBatch, TEntry, TPushedBatch>(control: Control<TBatch, TEntry, TPushedBatch>): (object_stream: Highland.Stream<TEntry>) => Highland.Stream<TPushedBatch> {
  return function(object_stream: Highland.Stream<TEntry>): Highland.Stream<TPushedBatch> {
    const output_stream: Highland.Stream<TPushedBatch> = highland();
    object_stream.scan(control.beginWith(), (batch, entry) => {
      const result = control.forEachEntry(batch, entry);
      if (result.batch_to_push) {
        output_stream.write(result.batch_to_push);
      }
      return result.batch_to_update;
    })
      .last()
      .map(last_batch => {
        const result = control.end(last_batch);
        result.batch_to_push && output_stream.write(result.batch_to_push);
      })
      .done(() => {
        output_stream.end()
      });
      
    return output_stream;
  }
}


export interface TBatchSamePattern<TPattern, TEntry> {
  accumulate_pattern: TPattern | null;
  items: TEntry[];
}

const samePattern = <TEntry, TPattern>({
  extractPattern,
  same,
}: {
  extractPattern: (entry: TEntry, accumulate_pattern: TPattern | null) => TPattern;
  same: (a: TPattern, b: TPattern) => boolean;
}): Control<TBatchSamePattern<TPattern, TEntry>, TEntry, TBatchSamePattern<TPattern, TEntry> | null> => {
  return {
    beginWith: () => ({ accumulate_pattern: null, items: [] }),
    forEachEntry: (batch, entry) => {
      const { accumulate_pattern, items } = batch;
      const current_pattern = extractPattern(entry, accumulate_pattern);
      if (accumulate_pattern === null || same(accumulate_pattern, current_pattern)) {
        return {
          batch_to_push: null,
          batch_to_update: {
            accumulate_pattern: current_pattern,
            items: [...items, entry],
          },
        };
      } else {
        return {
          batch_to_push: {
            accumulate_pattern,
            items,
          },
          batch_to_update: {
            accumulate_pattern: current_pattern,
            items: [entry],
          },
        };
      }
    },
    end: (last_batch) => {
      return {
        batch_to_push: {
          accumulate_pattern: last_batch.accumulate_pattern,
          items: last_batch.items,
        },
      };
    },
  };
};

const sameProperty = <TEntry, TKey extends keyof TEntry>(
  propName: TKey
) => {
  return samePattern<TEntry, TEntry[TKey]>({
    extractPattern: x => x[propName],
    same: (p1, p2) => p1 === p2
  });
};

/**
 * 
 * @example
 * Example using it with highland.through
 * 
 * ```
 * highland([
 *   {sku:'a', order_id:1},
 *   {sku:'b', order_id:1},
 *   {sku:'c', order_id:2}
 * ]).through(batchByProp('order_id'))
 * .each(console.log)
 * .done(() => {})
 * ```
 * Output:
 * 
 * ```
 * [
 *   {accumulate_pattern: 1, items: [{sku:'a', order_id:1}, {sku:'b', order_id:1}]},
 *   {accumulate_pattern: 2, items: [{sku:'c', order_id:2}]}
 * ]
 * ```
 * 
 * @param propName 
 * @returns 
 */
export const batchByProp = <TEntry, TKey extends keyof TEntry>(propName: TKey) => batchBy(sameProperty<TEntry, TKey>(propName))

