import { sequelize } from '../src/config/database';
import * as repository from '../src/modules/orders/orders.repository';
import { readClsMilestoneDates } from '../src/domain/milestones';

const main = async () => {
  // One legalisation order and one public visa, read the way the detail screen does.
  for (const id of [25, 19, 23]) {
    const order = await repository.findClsOrderById(id);
    if (!order) {
      console.log(`order ${id}: not found`);
      continue;
    }
    const withIncludes = order as unknown as {
      order_type: number | null;
      destinations?: unknown[];
      legalisationDetails?: unknown[];
      policeClearanceDetails?: unknown[];
    };
    console.log(
      `order ${id} type=${withIncludes.order_type}`,
      'destinations=', withIncludes.destinations?.length ?? 0,
      'legalisationDetails=', withIncludes.legalisationDetails?.length ?? 0,
      'clearanceDetails=', withIncludes.policeClearanceDetails?.length ?? 0,
      'milestones=', readClsMilestoneDates(order as never)
    );
  }

  const list = await repository.listClsOrders({ clientId: 1, limit: 5, offset: 0 });
  console.log('list count', list.count, 'rows', list.rows.length);
  for (const row of list.rows) {
    const r = row as unknown as { id: number; destinations?: unknown[] };
    console.log('  row', r.id, 'destinations loaded:', Array.isArray(r.destinations));
  }

  const legacyList = await repository.listLegacyOrders({ clientId: 1, limit: 3, offset: 0 });
  console.log('legacy list count', legacyList.count, 'rows', legacyList.rows.length);

  await sequelize.close();
};

void main();
