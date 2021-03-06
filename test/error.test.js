/* Copyright (c) 2014-2015 Richard Rodger, MIT License */
'use strict'

var Assert = require('assert')
var Lab = require('lab')
var Seneca = require('..')

var lab = exports.lab = Lab.script()
var describe = lab.describe
var it = lab.it
var assert = Assert
var testopts = {log: 'silent'}

// Shortcuts
var arrayify = Function.prototype.apply.bind(Array.prototype.slice)

describe('error', function () {
  lab.beforeEach(function (done) {
    process.removeAllListeners('SIGHUP')
    process.removeAllListeners('SIGTERM')
    process.removeAllListeners('SIGINT')
    process.removeAllListeners('SIGBREAK')
    done()
  })

  it('act_not_found', act_not_found)

  it('exec_action_throw_basic', exec_action_throw_basic)
  it('exec_action_throw_nolog', exec_action_throw_nolog)
  it('exec_action_errhandler_throw', exec_action_errhandler_throw)

  it('exec_action_result', exec_action_result)
  it('exec_action_result_nolog', exec_action_result_nolog)
  it('exec_action_errhandler_result', exec_action_errhandler_result)

  it('action_callback', action_callback)

  it('ready_die', ready_die)

  it('legacy_fail', legacy_fail)

  function act_not_found (done) {
    var ctxt = {errlog: null}
    var si = make_seneca(ctxt)

    // ~~ CASE: fire-and-forget; err-logged
    si.act('a:1')
    // FIX: validate using act events
    // assert.equal('act_not_found', ctxt.errlog[8])

    // ~~ CASE: callback; default
    ctxt.errlog = null
    si.act('a:1,default$:{x:1}', function (err, out) {
      assert.equal(err, null)
      assert.equal(ctxt.errlog, null)
      assert.ok(out.x)
    })

    // ~~ CASE: callback; default Array
    ctxt.errlog = null
    si.act('a:1,default$:[1,"foo"]', function (err, out) {
      assert.ok(err === null)
      assert.ok(ctxt.errlog === null)
      assert.equal(out[0], 1)
      assert.ok(out[1], 'foo')
    })

    // ~~ CASE: callback; no-default; err-result; err-logged
    si.act('a:1', function (err, out) {
      assert.equal(out, null)
      assert.equal('act_not_found', err.code)
      // assert.equal('act_not_found', ctxt.errlog[8])

      // ~~ CASE: callback; bad-default; err-result; err-logged
      si.act('a:1,default$:"foo"', function (err, out) {
        assert.equal(out, null)
        assert.equal('act_default_bad', err.code)
        // assert.equal('act_default_bad', ctxt.errlog[8])

        // ~~ CASE: fragile; throws; err-logged
        si.options({debug: {fragile: true}})
        ctxt.errlog = null

        si.act('a:1', function (ex) {
          assert.equal('act_not_found', ex.code)
          // assert.equal('act_not_found', ctxt.errlog[8])
          return done()
        })
      })
    })
  }

  function exec_action_throw_basic (done) {
    var ctxt = {errlog: null, done: done, log: true, name: 'throw'}
    var si = make_seneca(ctxt)

    si.add('a:1', function (args, done) {
      throw new Error('AAA')
    })

    test_action(si, ctxt)
  }

  function exec_action_result (done) {
    var ctxt = {errlog: null, done: done, log: true, name: 'result'}
    var si = make_seneca(ctxt)

    si.add('a:1', function (args, done) {
      done(new Error('BBB'))
    })

    test_action(si, ctxt)
  }

  // REMOVE after Seneca 3.x
  // err.log = false is a feature of legacy logging
  function exec_action_throw_nolog (done) {
    var ctxt = {errlog: null, done: done, log: false, name: 'throw_nolog'}
    var si = make_seneca(ctxt)

    if (si.options().legacy.logging) {
      si.add('a:1', function (args, done) {
        var err = new Error('CCC')
        err.log = false
        throw err
      })

      test_action(si, ctxt)
    }
    else {
      done()
    }
  }

  // REMOVE after Seneca 3.x
  // err.log = false is a feature of legacy logging
  function exec_action_result_nolog (done) {
    var ctxt = {errlog: null, done: done, log: false, name: 'result_nolog'}
    var si = make_seneca(ctxt)

    if (si.options().legacy.logging) {
      si.add('a:1', function (args, done) {
        var err = new Error('CCC')
        err.log = false
        done(err)
      })

      test_action(si, ctxt)
    }
    else {
      done()
    }
  }

  function exec_action_errhandler_throw (done) {
    var ctxt = {errlog: null}
    var si = make_seneca(ctxt)
    var aI = 0

    si.options({
      errhandler: function (err) {
        try {
          assert.equal('act_execute', err.code)
          assert.equal('a:1', err.details.pattern)
          assert.ok(err.message.indexOf('AAA' + aI) !== -1)

          aI++

          if (aI > 1) {
            return true
          }

          done()
        }
        catch (e) {
          done(e)
          return true
        }
      }
    })

    si.add('a:1', function (args, done) {
      throw new Error('AAA' + aI)
    })

    // ~~ CASE: action-throws; callback; errhandler-nostop
    si.act('a:1', function (err, out) {
      // Need to use try-catch here as we've subverted the log
      // to test logging.
      try {
        assert.equal(out, null)
        assert.equal('act_execute', err.code)
        assert.equal('a:1', err.details.pattern)

        if (si.options().legacy.logging) {
          assert.equal('act_execute', ctxt.errlog[14])
        }
        else {
          assert.equal('act_execute', ctxt.errlog.code)
        }

        ctxt.errlog = null

        // ~~ CASE: action-throws; no-callback; errhandler-nostop
        si.on('act-err', function (args, err) {
          if (aI === 1) {
            try {
              assert.equal(1, args.a)
              assert.equal('act_execute', err.code)
              assert.equal('a:1', err.details.pattern)
              if (si.options().legacy.logging) {
                assert.equal('act_execute', ctxt.errlog[14])
              }
              else {
                assert.equal('act_execute', ctxt.errlog.code)
              }


              // ~~ CASE: action-throws; callback; errhandler-stops
              ctxt.errlog = null
              si.act('a:1', function () {
                try {
                  assert.fail()
                }
                catch (e) {
                  done(e)
                }
              })
            }
            catch (e) { done(e) }
          }
        })
        si.act('a:1')
      }
      catch (e) {
        done(e)
      }
    })
  }

  function exec_action_errhandler_result (done) {
    var ctxt = {errlog: null}
    var si = make_seneca(ctxt)
    var aI = 0

    si.options({
      errhandler: function (err) {
        try {
          assert.equal('act_execute', err.code)
          assert.equal('a:1', err.details.pattern)
          assert.ok(err.message.indexOf('AAA' + aI) !== -1)

          aI++

          if (aI > 1) {
            return true
          }

          done()
        }
        catch (e) {
          done(e)
          return true
        }
      }
    })

    si.add('a:1', function (args, done) {
      done(new Error('AAA' + aI))
    })

    // ~~ CASE: action-throws; callback; errhandler-nostop
    si.act('a:1', function (err, out) {
      // Need to use try-catch here as we've subverted the log
      // to test logging.
      try {
        assert.equal(out, null)
        assert.equal('act_execute', err.code)
        assert.equal('a:1', err.details.pattern)
        if (si.options().legacy.logging) {
          assert.equal('act_execute', ctxt.errlog[14])
        }
        else {
          assert.equal('act_execute', ctxt.errlog.code)
        }

        ctxt.errlog = null

        // ~~ CASE: action-throws; no-callback; errhandler-nostop
        si.on('act-err', function (args, err) {
          if (aI === 1) {
            try {
              assert.equal(1, args.a)
              assert.equal('act_execute', err.code)
              assert.equal('a:1', err.details.pattern)
              if (si.options().legacy.logging) {
                assert.equal('act_execute', ctxt.errlog[14])
              }
              else {
                assert.equal('act_execute', ctxt.errlog.code)
              }

              // ~~ CASE: action-throws; callback; errhandler-stops
              ctxt.errlog = null
              si.act('a:1', function () {
                try {
                  assert.fail()
                }
                catch (e) {
                  done(e)
                }
              })
            }
            catch (e) {
              done(e)
            }
          }
        })
        si.act('a:1')
      }
      catch (e) {
        done(e)
      }
    })
  }

  function make_seneca (ctxt) {
    var si = Seneca(testopts)
    if (si.options().legacy.logging) {
      si.options({
        log: {map: [{level: 'error+', handler: function () {
          ctxt.errlog = arrayify(arguments)
        }}]},
        trace: { unknown: 'error' },
        legacy: { error_codes: false }
      })
      return si
    }
    else {
      var logger = function () {}
      logger.preload = function () {
        return {
          extend: {
            logger: function (s, d) {
              ctxt.errlog = d
            }
          }
        }
      }

      return Seneca({
        trace: { unknown: 'error' },
        legacy: { error_codes: false },
        internal: {
          logger: logger
        }})
    }
  }

  function test_action (si, ctxt) {
    try {
      // ~~ CASE: action; callback; no-errhandler
      si.act('a:1', function (err, out) {
        // Need to use try-catch here as we've subverted the log
        // to test logging.
        try {
          assert.equal(out, null)
          assert.equal('act_execute', err.code, ctxt.name + '-A')
          assert.equal('a:1', err.details.pattern, ctxt.name + '-B')

          if (ctxt.log) {
            if (si.options().legacy.logging) {
              assert.equal('act_execute', ctxt.errlog[14], ctxt.name + '-C')
            }
            else {
              assert.equal('act_execute', ctxt.errlog.code, ctxt.name + '-C')
            }
          }
          else {
            assert.equal(ctxt.errlog, null)
          }

          ctxt.errlog = null

          // ~~ CASE: action; no-callback; no-errhandler
          si.on('act-err', function (args, err) {
            try {
              assert.equal(1, args.a)
              assert.equal('act_execute', err.code, ctxt.name + '-D')
              assert.equal('a:1', err.details.pattern, ctxt.name + '-E')

              if (ctxt.log) {
                if (si.options().legacy.logging) {
                  assert.equal('act_execute', ctxt.errlog[14], ctxt.name + '-F')
                }
                else {
                  assert.equal('act_execute', ctxt.errlog.code, ctxt.name + '-F')
                }
              }

              ctxt.done()
            }
            catch (e) {
              ctxt.done(e)
            }
          })
          si.act('a:1')
        }
        catch (e) {
          ctxt.done(e)
        }
      })
    }
    catch (e) {
      ctxt.done(e)
    }
  }

  function action_callback (done) {
    var ctxt = {errlog: null}
    var si = make_seneca(ctxt)

    var log_it = true

    si.options({errhandler: function (err) {
      assert.equal('act_callback', err.code, 'callback-G')
      assert.equal('seneca: Action a:1 callback threw: DDD.', err.message)

      if (log_it) {
        if (si.options().legacy.logging) {
          assert.equal('act_callback', ctxt.errlog[14], 'callback-H')
        }
        else {
          assert.equal('act_callback', ctxt.errlog.code, 'callback-H')
        }
      }
      else {
        // REMOVE in Seneca 3.x
        // e.log = false is a legacy logging feature
        if (si.options().legacy.logging) {
          assert.equal(ctxt.errlog, null)
        }
        done()
      }
    }})

    si.ready(function () {
      si.add('a:1', function (args, done) { this.good({x: 1}) })

      setTimeout(function () {
        // ~~ CASE: action; callback; callback-throws; log
        si.act('a:1', function (err, out) {
          assert.equal(err, null)
          assert.ok(out.x)
          throw new Error('DDD')
        })
      }, 20)

      setTimeout(function () {
        // ~~ CASE: action; callback; callback-throws; no-log
        si.act('a:1', function (err, out) {
          assert.equal(err, null)
          assert.ok(out.x)
          var e = new Error('DDD')
          e.log = false
          log_it = false
          ctxt.errlog = null
          throw e
        })
      }, 40)
    })
  }

  function ready_die (done) {
    var si = Seneca({
      log: 'silent',
      debug: {undead: true},
      errhandler: function (err) {
        try {
          assert.ok(err.foo)
          done()
        }
        catch (e) {
          done(e)
        }
      }
    })

    si.ready(function () {
      var e = new Error('EEE')
      e.foo = true
      throw e
    })
  }

  function legacy_fail (done) {
    var si = Seneca({
      log: 'silent'
    })

    si.options({errhandler: function (err) {
      try {
        assert.equal('foo', err.code)
        assert.deepEqual({bar: 1}, err.details)
      }
      catch (e) {
        done(e)
      }
    }})

    var err = si.fail('foo', {bar: 1})
    assert.equal('foo', err.code)
    assert.deepEqual({bar: 1}, err.details)

    si.options({errhandler: function (err) {
      try {
        assert.equal('FOO', err.code)
        assert.deepEqual({BAR: 1}, err.details)
      }
      catch (e) {
        done(e)
      }
    }})

    err = si.fail('FOO', {BAR: 1}, function (err) {
      assert.equal('FOO', err.code)
      assert.deepEqual({BAR: 1}, err.details)
      setImmediate(done)
    })

    assert.equal('FOO', err.code)
    assert.deepEqual({BAR: 1}, err.details)
  }
})
