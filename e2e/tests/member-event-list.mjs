/**
 * The member event list collapses each event behind a <details>, so anything
 * below the title is hidden until the fold is opened. A test that asserts on
 * the body of a card opens it first -- the same click a member makes.
 */
export async function openEventDetails(page, index = 0) {
  const fold = page.locator("details.event-fold").nth(index);
  await fold.locator("> summary").click();
  await fold.evaluate((node) => {
    if (!node.open) throw new Error("the event fold did not open");
  });
}

export async function openEveryEventDetails(page) {
  const folds = page.locator("details.event-fold");
  const total = await folds.count();
  for (let index = 0; index < total; index += 1) await openEventDetails(page, index);
  return total;
}
