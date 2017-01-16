'use strict'

// Dependencies
const s3renity = require(`${__dirname}/..`);
const equals = require('array-equal')
const mkdirp = require('mkdirp').sync
const rimraf = require('rimraf').sync
const test = require('tape');
const path = require('path')
const fs = require('fs')

// Path variables
const folder = 'buckets'
const bucket = 's3renity'
const prefix = 'files'
const outputPrefix = 'output-files'
const files = ['file1', 'file2', 'file3', 'file4']
const localPath = path.resolve(__dirname, folder)
const bucketPath = path.resolve(__dirname, folder, bucket)
const prefixPath = path.resolve(__dirname, folder, bucket, prefix)
const outputPrefixPath = path.resolve(__dirname, folder, bucket, outputPrefix)
const filePaths = files.map(f => `${prefixPath}/${f}`)
const outputPaths = files.map(f => `${outputPrefixPath}/${f}`)

// S3renity object
const s3 = new s3renity({
  localPath,
  show_progress: false,
  verbose: false
});

resetSandbox()

function resetSandbox() {
  rimraf(path.resolve(__dirname, 'buckets'))
  mkdirp(prefixPath)
  files.forEach(file => {
    const filePath = path.resolve(__dirname, folder, bucketPath, prefixPath, file)
    fs.writeFileSync(filePath, file)
  })
}

/**
 * Returns the contents of a file
 */

function readFile(path) {
  return fs.readFileSync(path).toString().trim()
}

/**
 * Returns an array of the contents of each file in a directory
 */

function readFiles(files) {
  return files.map(readFile)
}

/**
 * Returns true if all the files in an array exist
 */

function filesExist(paths) {
  return paths.map(fileExists).every(f => f)
}

/**
 * Returns true if file exists
 */

function fileExists(path) {
  return fs.existsSync(path)
}

/**
 * Returns true if two arrays contain the same objects
 */

function arraysEqual(arr1, arr2) {
  return arr1.every((obj, index) => equals(obj, arr2[index]))
}

/**
 * List files in a directory
 */

function readDir(dir) {
  return fs.readdirSync(dir)
}

/**
 * Test key listing function
 * TODO test with endPrefix and marker
 */

test('s3renity.keys', t => {
  t.plan(1);
  let answer = files.map(f => `${prefix}/${f}`)
  s3
    .keys(bucket, prefix)
    .then(keys => {
      t.ok(equals(keys, answer), 'keys length matches')
    })
    .catch(e => console.error(e.stack));
});

/**
 * Test S3 methods get, put, and delete
 */

test('s3renity.put, s3renity.get, s3renity.delete', t => {

  resetSandbox()
  t.plan(3)

  let file = files[0]
  let key = `${prefix}/${file}`
  let body = 'hello world'
  let name = 'test'

  s3
    .put(bucket, key, body)
    .then(() => {
      let fileContents = readFile(`${prefixPath}/${file}`)
      t.ok(fileContents == body, 'put object')
      s3.get(bucket, key).then(obj => {
        t.ok(obj == body, 'get object')
        s3.delete(bucket, key).then(() => {
          t.ok(!fs.existsSync(`${key}`), 'delete object');
        }).catch(console.error);
      })
        .catch(console.error)
    })
    .catch(console.error)
});

test('s3renity.delete (batch)', t => {

  t.plan(1);

  const files = ['file2', 'file3', 'file4']
  const keys = files.map(file => `${prefix}/${file}`)

  s3.deleteObjects(bucket, keys).then(() => {
    t.ok(!filesExist(keys), 'delete multiple objects');
  }).catch(console.error);
});

test('s3renity.context.forEach (sync)', t => {

  resetSandbox();
  t.plan(1);

  const objects = []
  const answer = [ { object: 'file1', key: 'files/file1' },
    { object: 'file2', key: 'files/file2' },
    { object: 'file3', key: 'files/file3' },
    { object: 'file4', key: 'files/file4' } ]

  s3
    .context(bucket, prefix).forEach((obj, key) => {
      objects.push({
        object: obj,
        key: key
      })
    })
    .then(() => {
      t.ok(arraysEqual(objects, answer), 'forEach sync')
    })
    .catch(e => console.error(e.stack));
});

test('s3renity.context.forEach (async)', t => {

  resetSandbox();
  t.plan(1);

  const objects = []
  const answer = [
    { object: 'file1', key: 'files/file1' },
    { object: 'file2', key: 'files/file2' },
    { object: 'file3', key: 'files/file3' },
    { object: 'file4', key: 'files/file4' }
  ]

  s3
    .context(bucket, prefix)
    .forEach((obj, key) => {
      return new Promise((success, fail) => {
        objects.push({
          object: obj,
          key: key
        })
        success()
      });
    }, true).then(() => {
      t.ok(arraysEqual(objects, answer), 'forEach async')
    });
});

test('s3renity.context.map (sync)', t => {

  resetSandbox();
  t.plan(1);

  const answer = [
    'files/file1file1',
    'files/file2file2',
    'files/file3file3',
    'files/file4file4'
  ]

  s3
    .context(bucket, prefix)
    .map((obj, key) => {
      // update each object with the key prefixed
      return key + obj;
    }).then(() => {
      t.ok(equals(answer, readFiles(filePaths)), 'map sync')
    }).catch(console.error);
});

test('s3renity.context.map (async)', t => {

  resetSandbox();
  t.plan(1);

  const answer = [
    'files/file1file1',
    'files/file2file2',
    'files/file3file3',
    'files/file4file4'
  ]

  s3.context(bucket, prefix).map((obj, key) => {
    return new Promise((success, fail) => {
      success(key + obj);
    });
  }, true).then(() => {
    t.ok(equals(answer, readFiles(filePaths)), 'map async over 3 objects')
  }).catch(console.error);
});

test('s3renity.context.output.map (sync)', t => {

  resetSandbox();
  t.plan(1);

  const answer = [
    'files/file1file1',
    'files/file2file2',
    'files/file3file3',
    'files/file4file4'
  ]

  s3.context(bucket, prefix)
    .output(bucket, outputPrefix)
    .map((obj, key) => {
      return key + obj;
    }).then(() => {
      t.ok(equals(answer, readFiles(outputPaths)), 'map sync over')
    }).catch(console.error);
});

test('s3renity.context.output.map (async)', t => {

  resetSandbox();
  t.plan(1);

  const answer = [
    'files/file1file1',
    'files/file2file2',
    'files/file3file3',
    'files/file4file4'
  ]

  s3.context(bucket, prefix)
    .output(bucket, outputPrefix)
    .map((obj, key) => {
      return new Promise((success, fail) => {
        success(key + obj);
      });
    }, true).then(() => {
      t.ok(equals(answer, readFiles(outputPaths)), 'map async')
    }).catch(console.error);
});

test('s3renity.context.reduce (sync)', t => {

  resetSandbox()
  t.plan(1)

  const answer = 'file1file2file3file4'

  s3.context(bucket, prefix)
    .reduce((prev, cur, key) => {
      if (!prev) {
        return cur;
      } else {
        return prev + cur;
      }
    })
    .then(result => {
      t.ok(result == answer, 'reduce sync');
    }).catch(e => console.error(e.stack));
});

test('s3renity.context.reduce (async)', t => {

  resetSandbox();
  t.plan(1);

  const answer = 'file1file2file3file4'

  s3.context(bucket, prefix)
    .reduce((prev, cur, key) => {
      return new Promise((success, fail) => {
        if (!prev) {
          success(cur);
        } else {
          success(prev + cur);
        }
      });
    }, null, true)
    .then(result => {
      t.ok(result == answer, 'reduce async');
    }).catch(e => console.error(e.stack));
});

test('s3renity.context.filter (sync)', t => {

  resetSandbox();
  t.plan(1);

  let answer = ['file1']

  s3.context(bucket, prefix)
    .filter(obj => {
      return obj == 'file1';
    })
    .then(() => {
      t.ok(equals(answer, readDir(prefixPath)), 'filter inplace (sync)');
    })
    .catch(e => console.error(e));
});

test('s3renity.context.filter (async)', t => {

  resetSandbox();
  t.plan(1);

  let answer = ['file1']

  s3.context(bucket, prefix)
    .filter(obj => {
      return new Promise((success, fail) => {
        success(obj == 'file1');
      });
    }, true)
    .then(() => {
      t.ok(equals(fs.readdirSync(prefixPath), answer), 'filter 3 inplace (async)');
    })
    .catch(e => console.error(e.stack));
});

test('s3renity.context.output.filter (sync)', t => {

  resetSandbox();
  t.plan(1);

  let answer = ['file1'];

  s3.context(bucket, prefix)
    .output(bucket, outputPrefix)
    .filter(obj => {
      return obj == 'file1';
    })
    .then(() => {
      t.ok(equals(readDir(outputPrefixPath), answer), 'filter to output (sync)');
    })
    .catch(e => console.error(e.stack));
});

test('s3renity.context.output.filter (async)', t => {

  resetSandbox();
  t.plan(1);

  let answer = ['file1']

  s3.context(bucket, prefix)
    .output(bucket, outputPrefix)
    .filter(obj => {
      return new Promise((success, fail) => {
        success(obj == 'file1');
      });
    }, true)
    .then(() => {
      t.ok(equals(readDir(outputPrefixPath), answer), 'filter to output (async)');
    })
    .catch(e => console.error(e.stack));
});

test('end', t => {
  rimraf(path.resolve(__dirname, 'buckets'))
  t.end();
})
