const WITH_TIME = Symbol('WITH_TIME')

export function ChangedAt(value, time) {
  return { value, time, [WITH_TIME]: true }
}

export function NoConflictResolution(value) {
  return { value, [WITH_TIME]: false }
}

async function addFinished(server, ctx, type, action, meta) {
  await server.process(
    { ...action, type },
    { time: meta.time, excludeClients: [ctx.clientId] }
  )
}

function resendFinished(server, plural, type, all = true) {
  if (all) {
    server.type(type, {
      access() {
        return false
      },
      resend(ctx, action) {
        return [plural, `${plural}/${action.id}`]
      }
    })
  } else {
    server.type(type, {
      access() {
        return false
      },
      resend(ctx, action) {
        return [`${plural}/${action.id}`]
      }
    })
  }
}

function buildFilter(filter) {
  return (ctx, action) => {
    if (action.type.endsWith('/created')) {
      for (let key in filter) {
        if (action.fields[key] !== filter[key]) return false
      }
    }
    return true
  }
}

async function sendMap(server, changedType, data, since) {
  let { id, ...other } = data
  let byTime = new Map()
  for (let key in other) {
    if (other[key][WITH_TIME] === true) {
      let time = other[key].time
      if (!byTime.has(time)) byTime.set(time, {})
      byTime.get(time)[key] = other[key].value
    } else if (other[key][WITH_TIME] === false) {
      if (!byTime.has('now')) byTime.set('now', {})
      byTime.get('now')[key] = other[key].value
    } else {
      throw new Error('Wrap value into ChangedAt() or NoConflictResolution()')
    }
  }
  for (let [time, fields] of byTime.entries()) {
    let changedMeta
    if (time !== 'now') {
      changedMeta = { time }
      if (time < since) continue
    }
    await server.process(
      {
        type: changedType,
        id,
        fields
      },
      changedMeta
    )
  }
}

export function addSyncMap(server, plural, operations) {
  let createdType = `${plural}/created`
  let changedType = `${plural}/changed`
  let deletedType = `${plural}/deleted`
  resendFinished(server, plural, createdType)
  resendFinished(server, plural, changedType)
  resendFinished(server, plural, deletedType, false)

  if (operations.load) {
    server.channel(`${plural}/:id`, {
      access(ctx, action, meta) {
        return operations.access(ctx, ctx.params.id, action, meta)
      },
      async load(ctx, action, meta) {
        if (action.creating) return
        let since = action.since ? action.since.time : 0
        let data = await operations.load(
          ctx,
          ctx.params.id,
          since,
          action,
          meta
        )
        if (data !== false) {
          await sendMap(
            server,
            changedType,
            data,
            since
          )
        }
      }
    })
  }

  if (operations.create) {
    server.type(`${plural}/create`, {
      access(ctx, action, meta) {
        return operations.access(ctx, action.id, action, meta)
      },
      async process(ctx, action, meta) {
        let result = await operations.create(
          ctx,
          action.id,
          action.fields,
          meta.time,
          action,
          meta
        )
        if (result !== false) {
          await addFinished(server, ctx, createdType, action, meta)
        }
      }
    })
  }

  if (operations.change) {
    server.type(`${plural}/change`, {
      access(ctx, action, meta) {
        return operations.access(ctx, action.id, action, meta)
      },
      async process(ctx, action, meta) {
        let result = await operations.change(
          ctx,
          action.id,
          action.fields,
          meta.time,
          action,
          meta
        )
        if (result !== false) {
          await addFinished(server, ctx, changedType, action, meta)
        }
      }
    })
  }

  if (operations.delete) {
    server.type(`${plural}/delete`, {
      access(ctx, action, meta) {
        return operations.access(ctx, action.id, action, meta)
      },
      async process(ctx, action, meta) {
        let result = await operations.delete(ctx, action.id, action, meta)
        if (result !== false) {
          await addFinished(server, ctx, deletedType, action, meta)
        }
      }
    })
  }
}

export function addSyncMapFilter(server, plural, operations) {
  let changedType = `${plural}/changed`

  server.channel(plural, {
    access(ctx, action, meta) {
      return operations.access(ctx, action.filter, action, meta)
    },
    filter(ctx, action, meta) {
      let filter = action.filter ? buildFilter(action.filter) : () => true
      let custom = operations.actions
        ? operations.actions(ctx, action.filter, action, meta)
        : () => true
      return (ctx2, action2, meta2) => {
        return filter(ctx2, action2, meta2) && custom(ctx2, action2, meta2)
      }
    },
    async load(ctx, action, meta) {
      let since = action.since ? action.since.time : 0
      let data = await operations.initial(
        ctx,
        action.filter,
        since,
        action,
        meta
      )
      await Promise.all(
        data.map(async i => {
          await server.subscribe(ctx.nodeId, `${plural}/${i.id}`)
          await sendMap(server, changedType, i, since)
        })
      )
    }
  })
}
