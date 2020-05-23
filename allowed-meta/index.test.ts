import { ALLOWED_META } from '..'

it('has allowed meta keys list', () => {
  for (let key of ALLOWED_META) {
    expect(typeof key).toEqual('string')
  }
})
